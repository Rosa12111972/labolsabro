import secrets
import sqlite3
from functools import wraps

import requests
from flask import Blueprint, current_app, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import get_db

bp = Blueprint("auth", __name__)

GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo"


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def _google_configured():
    return bool(current_app.config.get("GOOGLE_CLIENT_ID") and current_app.config.get("GOOGLE_CLIENT_SECRET"))


def _log_in_user(user):
    session.clear()
    session["user_id"] = user["id"]
    session["email"] = user["email"]


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "").strip()
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user and user["password_hash"] and check_password_hash(user["password_hash"], password):
            _log_in_user(user)
            return redirect(request.args.get("next") or url_for("index"))
        flash("Email o contraseña incorrectos.")
    return render_template("login.html", google_enabled=_google_configured())


@bp.route("/login/google")
def login_google():
    if not _google_configured():
        flash("El inicio de sesión con Google no está configurado.")
        return redirect(url_for("auth.login"))

    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    redirect_uri = url_for("auth.login_google_callback", _external=True)
    params = {
        "client_id": current_app.config["GOOGLE_CLIENT_ID"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return redirect(f"{GOOGLE_AUTH_URI}?{query}")


@bp.route("/login/google/callback")
def login_google_callback():
    if not _google_configured():
        return redirect(url_for("auth.login"))

    state = request.args.get("state")
    if not state or state != session.pop("oauth_state", None):
        flash("La sesión de Google ha caducado, inténtalo de nuevo.")
        return redirect(url_for("auth.login"))

    code = request.args.get("code")
    if not code:
        flash("No se pudo iniciar sesión con Google.")
        return redirect(url_for("auth.login"))

    redirect_uri = url_for("auth.login_google_callback", _external=True)
    token_resp = requests.post(
        GOOGLE_TOKEN_URI,
        data={
            "client_id": current_app.config["GOOGLE_CLIENT_ID"],
            "client_secret": current_app.config["GOOGLE_CLIENT_SECRET"],
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if not token_resp.ok:
        flash("No se pudo validar el inicio de sesión con Google.")
        return redirect(url_for("auth.login"))

    access_token = token_resp.json().get("access_token")
    userinfo_resp = requests.get(
        GOOGLE_USERINFO_URI,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if not userinfo_resp.ok:
        flash("No se pudo obtener tu cuenta de Google.")
        return redirect(url_for("auth.login"))

    info = userinfo_resp.json()
    google_sub = info.get("sub")
    email = (info.get("email") or "").strip().lower()

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()
    if not user and email:
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user:
            db.execute("UPDATE users SET google_sub = ? WHERE id = ?", (google_sub, user["id"]))
            db.commit()

    if not user:
        flash(f"La cuenta {email} no tiene acceso a este panel. Pide que te den de alta.")
        return redirect(url_for("auth.login"))

    _log_in_user(user)
    return redirect(url_for("index"))


@bp.route("/registro", methods=["GET", "POST"])
def registro():
    db = get_db()
    hay_usuarios = db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] > 0
    autorizado = "user_id" in session or not hay_usuarios

    if not autorizado:
        flash("Ya existe un administrador. Pide que te den de alta desde el panel.")
        return redirect(url_for("auth.login"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "").strip()
        if not email or not password:
            flash("Rellena email y contraseña.")
            return render_template("registro.html")
        if len(password) < 6:
            flash("La contraseña debe tener al menos 6 caracteres.")
            return render_template("registro.html")

        try:
            db.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, generate_password_hash(password)),
            )
            db.commit()
        except sqlite3.IntegrityError:
            flash(f"Ya existe una cuenta con el email {email}.")
            return render_template("registro.html")

        if not hay_usuarios:
            user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            _log_in_user(user)
            return redirect(url_for("index"))

        flash(f"Cuenta creada para {email}.")
        return redirect(url_for("index"))

    return render_template("registro.html")


@bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.login"))

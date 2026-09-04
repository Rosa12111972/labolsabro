import os
import secrets
import sqlite3
from datetime import date
from functools import wraps

import click
from flask import Flask, abort, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "instance", "personal.db")

ROLES = ["conductor", "camarero", "azafata", "tecnico"]
FRANJAS = ["manana", "tarde", "noche"]
ESTADOS = ["disponible", "no_disponible", "asignado"]

ROLE_LABELS = {"conductor": "Conductor/a", "camarero": "Camarero/a", "azafata": "Azafata/o", "tecnico": "Técnico/a"}
FRANJA_LABELS = {"manana": "Mañana", "tarde": "Tarde", "noche": "Noche"}
ESTADO_LABELS = {"disponible": "Disponible", "no_disponible": "No disponible", "asignado": "Asignado"}

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-key-cambia-esto-en-produccion")

app.jinja_env.filters["role_label"] = lambda r: ROLE_LABELS.get(r, r)
app.jinja_env.filters["franja_label"] = lambda f: FRANJA_LABELS.get(f, f)
app.jinja_env.filters["estado_label"] = lambda e: ESTADO_LABELS.get(e, e)


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    with app.open_resource("schema.sql") as f:
        db.executescript(f.read().decode("utf8"))
    db.commit()


def create_default_admin():
    db = get_db()
    password = secrets.token_urlsafe(9)
    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        ("admin", generate_password_hash(password)),
    )
    db.commit()
    click.echo("=" * 60)
    click.echo("Base de datos inicializada por primera vez.")
    click.echo("Usuario: admin")
    click.echo(f"Contraseña: {password}")
    click.echo("Guárdala ahora, no se volverá a mostrar. Para crear más")
    click.echo('usuarios: flask --app app add-user <usuario> <contraseña>')
    click.echo("=" * 60)


@app.cli.command("init-db")
def init_db_command():
    """Crea (o reinicia) las tablas de la base de datos."""
    init_db()
    create_default_admin()


@app.cli.command("add-user")
@click.argument("username")
@click.argument("password")
def add_user_command(username, password):
    """Crea un nuevo usuario para acceder a la herramienta."""
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
        click.echo(f'Usuario "{username}" creado.')
    except sqlite3.IntegrityError:
        click.echo(f'Ya existe un usuario con nombre "{username}".')


@app.context_processor
def inject_globals():
    return dict(ROLES=ROLES, FRANJAS=FRANJAS, ESTADOS=ESTADOS)


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(request.args.get("next") or url_for("index"))
        flash("Usuario o contraseña incorrectos.")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    return redirect(url_for("buscar"))


@app.route("/personas")
@login_required
def personas_list():
    db = get_db()
    personas = db.execute("SELECT * FROM personas ORDER BY nombre").fetchall()
    return render_template("personas.html", personas=personas)


def _persona_form_data():
    return {
        "nombre": request.form.get("nombre", "").strip(),
        "rol": request.form.get("rol", ""),
        "telefono": request.form.get("telefono", "").strip(),
        "zona": request.form.get("zona", "").strip(),
    }


@app.route("/personas/nueva", methods=["GET", "POST"])
@login_required
def persona_nueva():
    if request.method == "POST":
        data = _persona_form_data()
        if not data["nombre"] or data["rol"] not in ROLES:
            flash("El nombre y el rol son obligatorios.")
        else:
            db = get_db()
            db.execute(
                "INSERT INTO personas (nombre, rol, telefono, zona) VALUES (?, ?, ?, ?)",
                (data["nombre"], data["rol"], data["telefono"], data["zona"]),
            )
            db.commit()
            return redirect(url_for("personas_list"))
        return render_template("persona_form.html", persona=data, persona_id=None)
    return render_template("persona_form.html", persona=None, persona_id=None)


@app.route("/personas/<int:persona_id>/editar", methods=["GET", "POST"])
@login_required
def persona_editar(persona_id):
    db = get_db()
    persona = db.execute("SELECT * FROM personas WHERE id = ?", (persona_id,)).fetchone()
    if persona is None:
        abort(404)
    if request.method == "POST":
        data = _persona_form_data()
        if not data["nombre"] or data["rol"] not in ROLES:
            flash("El nombre y el rol son obligatorios.")
            return render_template("persona_form.html", persona=data, persona_id=persona_id)
        db.execute(
            "UPDATE personas SET nombre = ?, rol = ?, telefono = ?, zona = ? WHERE id = ?",
            (data["nombre"], data["rol"], data["telefono"], data["zona"], persona_id),
        )
        db.commit()
        return redirect(url_for("personas_list"))
    return render_template("persona_form.html", persona=persona, persona_id=persona_id)


@app.route("/personas/<int:persona_id>/eliminar", methods=["POST"])
@login_required
def persona_eliminar(persona_id):
    db = get_db()
    db.execute("DELETE FROM personas WHERE id = ?", (persona_id,))
    db.commit()
    return redirect(url_for("personas_list"))


@app.route("/personas/<int:persona_id>/disponibilidad", methods=["GET", "POST"])
@login_required
def persona_disponibilidad(persona_id):
    db = get_db()
    persona = db.execute("SELECT * FROM personas WHERE id = ?", (persona_id,)).fetchone()
    if persona is None:
        abort(404)

    if request.method == "POST":
        fecha = request.form.get("fecha", "")
        franja = request.form.get("franja", "")
        estado = request.form.get("estado", "")
        if franja not in FRANJAS or estado not in ESTADOS or not fecha:
            flash("Revisa la fecha, la franja y el estado.")
        else:
            db.execute(
                """
                INSERT INTO disponibilidad (persona_id, fecha, franja, estado)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(persona_id, fecha, franja)
                DO UPDATE SET estado = excluded.estado
                """,
                (persona_id, fecha, franja, estado),
            )
            db.commit()
        return redirect(url_for("persona_disponibilidad", persona_id=persona_id))

    entradas = db.execute(
        "SELECT * FROM disponibilidad WHERE persona_id = ? ORDER BY fecha, franja",
        (persona_id,),
    ).fetchall()
    return render_template(
        "disponibilidad.html",
        persona=persona,
        entradas=entradas,
        today=date.today().isoformat(),
    )


@app.route("/disponibilidad/<int:entrada_id>/eliminar", methods=["POST"])
@login_required
def disponibilidad_eliminar(entrada_id):
    db = get_db()
    entrada = db.execute("SELECT persona_id FROM disponibilidad WHERE id = ?", (entrada_id,)).fetchone()
    db.execute("DELETE FROM disponibilidad WHERE id = ?", (entrada_id,))
    db.commit()
    if entrada:
        return redirect(url_for("persona_disponibilidad", persona_id=entrada["persona_id"]))
    return redirect(url_for("personas_list"))


@app.route("/buscar")
@login_required
def buscar():
    db = get_db()
    fecha = request.args.get("fecha") or date.today().isoformat()
    franja = request.args.get("franja", "")
    rol = request.args.get("rol", "")

    query = """
        SELECT personas.id, personas.nombre, personas.rol, personas.telefono, personas.zona,
               disponibilidad.franja, disponibilidad.estado
        FROM disponibilidad
        JOIN personas ON personas.id = disponibilidad.persona_id
        WHERE disponibilidad.fecha = ? AND disponibilidad.estado = 'disponible'
    """
    params = [fecha]
    if franja in FRANJAS:
        query += " AND disponibilidad.franja = ?"
        params.append(franja)
    if rol in ROLES:
        query += " AND personas.rol = ?"
        params.append(rol)
    query += " ORDER BY personas.nombre, disponibilidad.franja"

    resultados = db.execute(query, params).fetchall()
    return render_template("buscar.html", resultados=resultados, fecha=fecha, franja=franja, rol=rol)


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        with app.app_context():
            init_db()
            create_default_admin()
    app.run(debug=True, port=5000, use_reloader=False)

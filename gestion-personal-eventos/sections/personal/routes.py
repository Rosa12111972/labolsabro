from datetime import date

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from auth import login_required
from extensions import get_db

bp = Blueprint("personal", __name__, url_prefix="/personal")

ROLES = ["conductor", "camarero", "azafata", "tecnico"]
FRANJAS = ["manana", "tarde", "noche"]
ESTADOS = ["disponible", "no_disponible", "asignado"]

ROLE_LABELS = {"conductor": "Conductor/a", "camarero": "Camarero/a", "azafata": "Azafata/o", "tecnico": "Técnico/a"}
FRANJA_LABELS = {"manana": "Mañana", "tarde": "Tarde", "noche": "Noche"}
ESTADO_LABELS = {"disponible": "Disponible", "no_disponible": "No disponible", "asignado": "Asignado"}


@bp.app_template_filter("role_label")
def role_label(r):
    return ROLE_LABELS.get(r, r)


@bp.app_template_filter("franja_label")
def franja_label(f):
    return FRANJA_LABELS.get(f, f)


@bp.app_template_filter("estado_label")
def estado_label(e):
    return ESTADO_LABELS.get(e, e)


@bp.context_processor
def inject_constants():
    return dict(ROLES=ROLES, FRANJAS=FRANJAS, ESTADOS=ESTADOS)


@bp.route("/")
@login_required
def index():
    return redirect(url_for("personal.buscar"))


@bp.route("/personas")
@login_required
def personas_list():
    db = get_db()
    personas = db.execute("SELECT * FROM personas ORDER BY nombre").fetchall()
    return render_template("personal/personas.html", personas=personas)


def _persona_form_data():
    return {
        "nombre": request.form.get("nombre", "").strip(),
        "rol": request.form.get("rol", ""),
        "telefono": request.form.get("telefono", "").strip(),
        "zona": request.form.get("zona", "").strip(),
    }


@bp.route("/personas/nueva", methods=["GET", "POST"])
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
            return redirect(url_for("personal.personas_list"))
        return render_template("personal/persona_form.html", persona=data, persona_id=None)
    return render_template("personal/persona_form.html", persona=None, persona_id=None)


@bp.route("/personas/<int:persona_id>/editar", methods=["GET", "POST"])
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
            return render_template("personal/persona_form.html", persona=data, persona_id=persona_id)
        db.execute(
            "UPDATE personas SET nombre = ?, rol = ?, telefono = ?, zona = ? WHERE id = ?",
            (data["nombre"], data["rol"], data["telefono"], data["zona"], persona_id),
        )
        db.commit()
        return redirect(url_for("personal.personas_list"))
    return render_template("personal/persona_form.html", persona=persona, persona_id=persona_id)


@bp.route("/personas/<int:persona_id>/eliminar", methods=["POST"])
@login_required
def persona_eliminar(persona_id):
    db = get_db()
    db.execute("DELETE FROM personas WHERE id = ?", (persona_id,))
    db.commit()
    return redirect(url_for("personal.personas_list"))


@bp.route("/personas/<int:persona_id>/disponibilidad", methods=["GET", "POST"])
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
        return redirect(url_for("personal.persona_disponibilidad", persona_id=persona_id))

    entradas = db.execute(
        "SELECT * FROM disponibilidad WHERE persona_id = ? ORDER BY fecha, franja",
        (persona_id,),
    ).fetchall()
    return render_template(
        "personal/disponibilidad.html",
        persona=persona,
        entradas=entradas,
        today=date.today().isoformat(),
    )


@bp.route("/disponibilidad/<int:entrada_id>/eliminar", methods=["POST"])
@login_required
def disponibilidad_eliminar(entrada_id):
    db = get_db()
    entrada = db.execute("SELECT persona_id FROM disponibilidad WHERE id = ?", (entrada_id,)).fetchone()
    db.execute("DELETE FROM disponibilidad WHERE id = ?", (entrada_id,))
    db.commit()
    if entrada:
        return redirect(url_for("personal.persona_disponibilidad", persona_id=entrada["persona_id"]))
    return redirect(url_for("personal.personas_list"))


@bp.route("/buscar")
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
    return render_template("personal/buscar.html", resultados=resultados, fecha=fecha, franja=franja, rol=rol)

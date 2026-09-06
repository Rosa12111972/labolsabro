import calendar as calendar_module
import secrets
from datetime import date, datetime

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for

from auth import login_required
from extensions import get_db


def _generar_codigo():
    return secrets.token_urlsafe(6)[:8].upper()

bp = Blueprint("eventos", __name__, url_prefix="/eventos")

TIPOS = ["boda", "corporativo", "feria", "presentacion_producto", "privado", "otro"]
ESTADOS = ["en_negociacion", "confirmado", "en_curso", "finalizado", "cancelado"]
CATEGORIAS_RECURSO = ["personal", "vehiculo"]

TIPO_LABELS = {
    "boda": "Boda",
    "corporativo": "Evento corporativo",
    "feria": "Feria",
    "presentacion_producto": "Presentación de producto",
    "privado": "Evento privado",
    "otro": "Otro",
}
ESTADO_LABELS = {
    "en_negociacion": "En negociación",
    "confirmado": "Confirmado",
    "en_curso": "En curso",
    "finalizado": "Finalizado",
    "cancelado": "Cancelado",
}
CATEGORIA_LABELS = {"personal": "Personal", "vehiculo": "Vehículo"}

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


@bp.app_template_filter("tipo_label")
def tipo_label(t):
    return TIPO_LABELS.get(t, t)


@bp.app_template_filter("estado_evento_label")
def estado_evento_label(e):
    return ESTADO_LABELS.get(e, e)


@bp.app_template_filter("categoria_label")
def categoria_label(c):
    return CATEGORIA_LABELS.get(c, c)


@bp.context_processor
def inject_constants():
    return dict(
        TIPOS=TIPOS,
        ESTADOS=ESTADOS,
        CATEGORIAS_RECURSO=CATEGORIAS_RECURSO,
        TIPO_LABELS=TIPO_LABELS,
        ESTADO_LABELS=ESTADO_LABELS,
    )


def _get_evento_or_404(db, evento_id):
    evento = db.execute("SELECT * FROM eventos WHERE id = ?", (evento_id,)).fetchone()
    if evento is None:
        abort(404)
    return evento


@bp.route("/")
@login_required
def index():
    db = get_db()
    estado = request.args.get("estado", "")
    tipo = request.args.get("tipo", "")
    cuando = request.args.get("cuando", "")
    cliente = request.args.get("cliente", "").strip()
    hoy = date.today().isoformat()

    query = "SELECT * FROM eventos WHERE 1 = 1"
    params = []
    if estado in ESTADOS:
        query += " AND estado = ?"
        params.append(estado)
    if tipo in TIPOS:
        query += " AND tipo = ?"
        params.append(tipo)
    if cliente:
        query += " AND cliente LIKE ?"
        params.append(f"%{cliente}%")
    if cuando == "proximos":
        query += " AND fecha_fin >= ?"
        params.append(hoy)
        query += " ORDER BY fecha_inicio ASC"
    elif cuando == "pasados":
        query += " AND fecha_fin < ?"
        params.append(hoy)
        query += " ORDER BY fecha_inicio DESC"
    else:
        query += " ORDER BY fecha_inicio ASC"

    eventos = db.execute(query, params).fetchall()
    return render_template(
        "eventos/list.html",
        eventos=eventos,
        estado=estado,
        tipo=tipo,
        cuando=cuando,
        cliente=cliente,
        hoy=hoy,
    )


@bp.route("/calendario")
@login_required
def calendario():
    db = get_db()
    hoy = date.today()
    try:
        anio = int(request.args.get("anio", hoy.year))
        mes = int(request.args.get("mes", hoy.month))
    except ValueError:
        anio, mes = hoy.year, hoy.month
    if mes < 1:
        mes, anio = 12, anio - 1
    elif mes > 12:
        mes, anio = 1, anio + 1

    primer_dia = date(anio, mes, 1)
    ultimo_dia_num = calendar_module.monthrange(anio, mes)[1]
    ultimo_dia = date(anio, mes, ultimo_dia_num)

    eventos = db.execute(
        """
        SELECT * FROM eventos
        WHERE fecha_inicio <= ? AND fecha_fin >= ?
        ORDER BY fecha_inicio
        """,
        (ultimo_dia.isoformat(), primer_dia.isoformat()),
    ).fetchall()

    eventos_por_dia = {}
    for evento in eventos:
        ini = max(date.fromisoformat(evento["fecha_inicio"]), primer_dia)
        fin = min(date.fromisoformat(evento["fecha_fin"]), ultimo_dia)
        d = ini
        while d <= fin:
            eventos_por_dia.setdefault(d.day, []).append(evento)
            d = date.fromordinal(d.toordinal() + 1)

    primer_dia_semana = (primer_dia.weekday())  # 0=lunes
    semanas = []
    semana = [None] * primer_dia_semana
    for dia in range(1, ultimo_dia_num + 1):
        semana.append(dia)
        if len(semana) == 7:
            semanas.append(semana)
            semana = []
    if semana:
        while len(semana) < 7:
            semana.append(None)
        semanas.append(semana)

    return render_template(
        "eventos/calendario.html",
        anio=anio,
        mes=mes,
        nombre_mes=MESES[mes - 1],
        semanas=semanas,
        eventos_por_dia=eventos_por_dia,
        hoy=hoy,
    )


def _evento_form_data():
    fecha_inicio = request.form.get("fecha_inicio", "").strip()
    fecha_fin = request.form.get("fecha_fin", "").strip() or fecha_inicio
    presupuesto_raw = request.form.get("presupuesto", "").strip()
    try:
        num_invitados = int(request.form.get("num_invitados", "").strip() or 0) or None
    except ValueError:
        num_invitados = None
    try:
        presupuesto = float(presupuesto_raw) if presupuesto_raw else None
    except ValueError:
        presupuesto = None
    return {
        "nombre": request.form.get("nombre", "").strip(),
        "cliente": request.form.get("cliente", "").strip(),
        "tipo": request.form.get("tipo", ""),
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "ubicacion": request.form.get("ubicacion", "").strip(),
        "num_invitados": num_invitados,
        "hora_inicio": request.form.get("hora_inicio", "").strip(),
        "hora_fin": request.form.get("hora_fin", "").strip(),
        "presupuesto": presupuesto,
        "notas": request.form.get("notas", "").strip(),
    }


@bp.route("/nuevo", methods=["GET", "POST"])
@login_required
def nuevo():
    if request.method == "POST":
        data = _evento_form_data()
        if not data["nombre"] or data["tipo"] not in TIPOS or not data["fecha_inicio"]:
            flash("El nombre, el tipo y la fecha de inicio son obligatorios.")
            return render_template("eventos/form.html", evento=data, evento_id=None)
        db = get_db()
        cur = db.execute(
            """
            INSERT INTO eventos
                (nombre, cliente, tipo, fecha_inicio, fecha_fin, ubicacion, num_invitados,
                 hora_inicio, hora_fin, presupuesto, notas, estado, codigo_acceso, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_negociacion', ?, ?)
            """,
            (
                data["nombre"], data["cliente"], data["tipo"], data["fecha_inicio"], data["fecha_fin"],
                data["ubicacion"], data["num_invitados"], data["hora_inicio"], data["hora_fin"],
                data["presupuesto"], data["notas"], _generar_codigo(), datetime.utcnow().isoformat(),
            ),
        )
        db.commit()
        return redirect(url_for("eventos.detalle", evento_id=cur.lastrowid))
    return render_template("eventos/form.html", evento=None, evento_id=None)


@bp.route("/<int:evento_id>/editar", methods=["GET", "POST"])
@login_required
def editar(evento_id):
    db = get_db()
    evento = _get_evento_or_404(db, evento_id)
    if request.method == "POST":
        data = _evento_form_data()
        if not data["nombre"] or data["tipo"] not in TIPOS or not data["fecha_inicio"]:
            flash("El nombre, el tipo y la fecha de inicio son obligatorios.")
            return render_template("eventos/form.html", evento=data, evento_id=evento_id)
        db.execute(
            """
            UPDATE eventos SET
                nombre = ?, cliente = ?, tipo = ?, fecha_inicio = ?, fecha_fin = ?, ubicacion = ?,
                num_invitados = ?, hora_inicio = ?, hora_fin = ?, presupuesto = ?, notas = ?
            WHERE id = ?
            """,
            (
                data["nombre"], data["cliente"], data["tipo"], data["fecha_inicio"], data["fecha_fin"],
                data["ubicacion"], data["num_invitados"], data["hora_inicio"], data["hora_fin"],
                data["presupuesto"], data["notas"], evento_id,
            ),
        )
        db.commit()
        return redirect(url_for("eventos.detalle", evento_id=evento_id))
    return render_template("eventos/form.html", evento=evento, evento_id=evento_id)


@bp.route("/<int:evento_id>/eliminar", methods=["POST"])
@login_required
def eliminar(evento_id):
    db = get_db()
    db.execute("DELETE FROM eventos WHERE id = ?", (evento_id,))
    db.commit()
    return redirect(url_for("eventos.index"))


@bp.route("/<int:evento_id>/estado", methods=["POST"])
@login_required
def cambiar_estado(evento_id):
    db = get_db()
    _get_evento_or_404(db, evento_id)
    estado = request.form.get("estado", "")
    if estado not in ESTADOS:
        flash("Estado no válido.")
    else:
        db.execute("UPDATE eventos SET estado = ? WHERE id = ?", (estado, evento_id))
        db.commit()
    return redirect(url_for("eventos.detalle", evento_id=evento_id))


@bp.route("/<int:evento_id>")
@login_required
def detalle(evento_id):
    db = get_db()
    evento = _get_evento_or_404(db, evento_id)
    recursos = db.execute(
        "SELECT * FROM evento_recursos WHERE evento_id = ? ORDER BY categoria, id",
        (evento_id,),
    ).fetchall()
    hitos = db.execute(
        "SELECT * FROM evento_hitos WHERE evento_id = ? ORDER BY hora, id",
        (evento_id,),
    ).fetchall()
    return render_template("eventos/detalle.html", evento=evento, recursos=recursos, hitos=hitos)


@bp.route("/<int:evento_id>/recursos/nuevo", methods=["POST"])
@login_required
def recurso_nuevo(evento_id):
    db = get_db()
    _get_evento_or_404(db, evento_id)
    categoria = request.form.get("categoria", "")
    descripcion = request.form.get("descripcion", "").strip()
    try:
        cantidad = max(1, int(request.form.get("cantidad", "1")))
    except ValueError:
        cantidad = 1
    if categoria not in CATEGORIAS_RECURSO or not descripcion:
        flash("Indica la categoría y una descripción para el recurso.")
    else:
        db.execute(
            "INSERT INTO evento_recursos (evento_id, categoria, descripcion, cantidad, asignado) VALUES (?, ?, ?, ?, 0)",
            (evento_id, categoria, descripcion, cantidad),
        )
        db.commit()
    return redirect(url_for("eventos.detalle", evento_id=evento_id))


@bp.route("/recursos/<int:recurso_id>/toggle", methods=["POST"])
@login_required
def recurso_toggle(recurso_id):
    db = get_db()
    recurso = db.execute("SELECT * FROM evento_recursos WHERE id = ?", (recurso_id,)).fetchone()
    if recurso is None:
        abort(404)
    db.execute("UPDATE evento_recursos SET asignado = ? WHERE id = ?", (0 if recurso["asignado"] else 1, recurso_id))
    db.commit()
    return redirect(url_for("eventos.detalle", evento_id=recurso["evento_id"]))


@bp.route("/recursos/<int:recurso_id>/eliminar", methods=["POST"])
@login_required
def recurso_eliminar(recurso_id):
    db = get_db()
    recurso = db.execute("SELECT * FROM evento_recursos WHERE id = ?", (recurso_id,)).fetchone()
    if recurso is None:
        abort(404)
    db.execute("DELETE FROM evento_recursos WHERE id = ?", (recurso_id,))
    db.commit()
    return redirect(url_for("eventos.detalle", evento_id=recurso["evento_id"]))


@bp.route("/<int:evento_id>/hitos/nuevo", methods=["POST"])
@login_required
def hito_nuevo(evento_id):
    db = get_db()
    _get_evento_or_404(db, evento_id)
    hora = request.form.get("hora", "").strip()
    descripcion = request.form.get("descripcion", "").strip()
    if not hora or not descripcion:
        flash("Indica la hora y la descripción del hito.")
    else:
        db.execute(
            "INSERT INTO evento_hitos (evento_id, hora, descripcion) VALUES (?, ?, ?)",
            (evento_id, hora, descripcion),
        )
        db.commit()
    return redirect(url_for("eventos.detalle", evento_id=evento_id))


@bp.route("/hitos/<int:hito_id>/eliminar", methods=["POST"])
@login_required
def hito_eliminar(hito_id):
    db = get_db()
    hito = db.execute("SELECT * FROM evento_hitos WHERE id = ?", (hito_id,)).fetchone()
    if hito is None:
        abort(404)
    db.execute("DELETE FROM evento_hitos WHERE id = ?", (hito_id,))
    db.commit()
    return redirect(url_for("eventos.detalle", evento_id=hito["evento_id"]))


# ── Asignaciones de personal a eventos ──


@bp.route("/<int:evento_id>/asignar", methods=["GET", "POST"])
@login_required
def asignar(evento_id):
    db = get_db()
    evento = _get_evento_or_404(db, evento_id)

    ya_asignados = {
        r["persona_id"]
        for r in db.execute(
            "SELECT persona_id FROM evento_asignaciones WHERE evento_id = ?", (evento_id,)
        ).fetchall()
    }
    todas = db.execute("SELECT * FROM personas ORDER BY nombre").fetchall()
    disponibles = [p for p in todas if p["id"] not in ya_asignados]

    if request.method == "POST":
        persona_ids = request.form.getlist("persona_ids")
        if not persona_ids:
            flash("Selecciona al menos una persona.")
            return render_template(
                "eventos/asignar.html", evento=evento, disponibles=disponibles,
            )

        from email_service import enviar_asignacion

        base_url = current_app.config.get("BASE_URL", "http://127.0.0.1:5000")
        asignados = 0
        emails_ok = 0

        for pid_str in persona_ids:
            try:
                pid = int(pid_str)
            except ValueError:
                continue
            persona = db.execute("SELECT * FROM personas WHERE id = ?", (pid,)).fetchone()
            if not persona or pid in ya_asignados:
                continue

            now = datetime.utcnow().isoformat()
            email_enviado = None

            if persona["email"]:
                try:
                    ok = enviar_asignacion(
                        persona["nombre"], persona["email"], evento["nombre"],
                        evento["fecha_inicio"], evento["ubicacion"],
                        evento["codigo_acceso"], base_url,
                    )
                    if ok:
                        email_enviado = now
                        emails_ok += 1
                except Exception as exc:
                    flash(f"Error enviando email a {persona['nombre']}: {exc}")

            db.execute(
                """
                INSERT INTO evento_asignaciones (evento_id, persona_id, asignado_at, email_enviado_at)
                VALUES (?, ?, ?, ?)
                """,
                (evento_id, pid, now, email_enviado),
            )
            asignados += 1
            ya_asignados.add(pid)

        db.commit()
        msg = f"{asignados} persona(s) asignada(s)."
        if emails_ok:
            msg += f" {emails_ok} email(s) enviado(s)."
        flash(msg)
        return redirect(url_for("eventos.confirmaciones", evento_id=evento_id))

    return render_template("eventos/asignar.html", evento=evento, disponibles=disponibles)


@bp.route("/<int:evento_id>/asignaciones/<int:asig_id>/reenviar", methods=["POST"])
@login_required
def reenviar_email(evento_id, asig_id):
    db = get_db()
    evento = _get_evento_or_404(db, evento_id)
    asig = db.execute(
        "SELECT a.*, p.nombre, p.email FROM evento_asignaciones a JOIN personas p ON p.id = a.persona_id WHERE a.id = ?",
        (asig_id,),
    ).fetchone()
    if asig is None:
        abort(404)
    if not asig["email"]:
        flash(f"{asig['nombre']} no tiene email registrado.")
        return redirect(url_for("eventos.confirmaciones", evento_id=evento_id))

    from email_service import enviar_asignacion

    base_url = current_app.config.get("BASE_URL", "http://127.0.0.1:5000")
    try:
        ok = enviar_asignacion(
            asig["nombre"], asig["email"], evento["nombre"],
            evento["fecha_inicio"], evento["ubicacion"],
            evento["codigo_acceso"], base_url,
        )
        if ok:
            db.execute(
                "UPDATE evento_asignaciones SET email_enviado_at = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), asig_id),
            )
            db.commit()
            flash(f"Email reenviado a {asig['nombre']}.")
        else:
            flash("SMTP no configurado — email no enviado.")
    except Exception as exc:
        flash(f"Error enviando email: {exc}")

    return redirect(url_for("eventos.confirmaciones", evento_id=evento_id))


@bp.route("/<int:evento_id>/asignaciones/<int:asig_id>/eliminar", methods=["POST"])
@login_required
def desasignar(evento_id, asig_id):
    db = get_db()
    _get_evento_or_404(db, evento_id)
    db.execute("DELETE FROM evento_asignaciones WHERE id = ? AND evento_id = ?", (asig_id, evento_id))
    db.commit()
    flash("Persona desasignada del evento.")
    return redirect(url_for("eventos.confirmaciones", evento_id=evento_id))


# ── Ruta pública: confirmación de disponibilidad por código ──


@bp.route("/confirmar", methods=["GET", "POST"])
def confirmar_acceso():
    if request.method == "POST":
        codigo = request.form.get("codigo", "").strip().upper()
        if not codigo:
            flash("Introduce un código de acceso.")
            return render_template("eventos/confirmar_codigo.html")
        db = get_db()
        evento = db.execute("SELECT * FROM eventos WHERE codigo_acceso = ?", (codigo,)).fetchone()
        if evento is None:
            flash("Código no válido. Revisa el código que te han proporcionado.")
            return render_template("eventos/confirmar_codigo.html")
        return redirect(url_for("eventos.confirmar_form", codigo=codigo))
    return render_template("eventos/confirmar_codigo.html")


@bp.route("/confirmar/<codigo>", methods=["GET", "POST"])
def confirmar_form(codigo):
    db = get_db()
    evento = db.execute("SELECT * FROM eventos WHERE codigo_acceso = ?", (codigo.upper(),)).fetchone()
    if evento is None:
        flash("Código no válido.")
        return redirect(url_for("eventos.confirmar_acceso"))

    personas = db.execute("SELECT * FROM personas ORDER BY nombre").fetchall()

    if request.method == "POST":
        try:
            persona_id = int(request.form.get("persona_id", ""))
        except (ValueError, TypeError):
            flash("Selecciona tu nombre de la lista.")
            return render_template(
                "eventos/confirmar_form.html", evento=evento, personas=personas, enviado=False,
            )
        persona = db.execute("SELECT * FROM personas WHERE id = ?", (persona_id,)).fetchone()
        if persona is None:
            flash("Persona no encontrada.")
            return render_template(
                "eventos/confirmar_form.html", evento=evento, personas=personas, enviado=False,
            )

        disponible = request.form.get("disponible", "") == "1"
        disponible_desde = request.form.get("disponible_desde", "").strip() or None
        comentario = request.form.get("comentario", "").strip() or None

        db.execute(
            """
            INSERT INTO confirmaciones (evento_id, persona_id, disponible, disponible_desde, comentario, respondido_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(evento_id, persona_id)
            DO UPDATE SET disponible = excluded.disponible,
                          disponible_desde = excluded.disponible_desde,
                          comentario = excluded.comentario,
                          respondido_at = excluded.respondido_at
            """,
            (evento["id"], persona_id, 1 if disponible else 0, disponible_desde, comentario, datetime.utcnow().isoformat()),
        )
        db.commit()
        return render_template(
            "eventos/confirmar_form.html", evento=evento, personas=personas, enviado=True,
        )

    return render_template(
        "eventos/confirmar_form.html", evento=evento, personas=personas, enviado=False,
    )


# ── Vista admin: estado de confirmaciones por evento ──


@bp.route("/<int:evento_id>/confirmaciones")
@login_required
def confirmaciones(evento_id):
    db = get_db()
    evento = _get_evento_or_404(db, evento_id)

    respuestas = db.execute(
        """
        SELECT c.*, p.nombre, p.rol, p.telefono, p.email
        FROM confirmaciones c
        JOIN personas p ON p.id = c.persona_id
        WHERE c.evento_id = ?
        ORDER BY c.respondido_at DESC
        """,
        (evento_id,),
    ).fetchall()
    ids_respondieron = {r["persona_id"] for r in respuestas}

    asignaciones = db.execute(
        """
        SELECT a.*, p.nombre, p.rol, p.telefono, p.email
        FROM evento_asignaciones a
        JOIN personas p ON p.id = a.persona_id
        WHERE a.evento_id = ?
        ORDER BY a.asignado_at DESC
        """,
        (evento_id,),
    ).fetchall()
    ids_asignados = {a["persona_id"] for a in asignaciones}

    pendientes = [a for a in asignaciones if a["persona_id"] not in ids_respondieron]

    todas_personas = db.execute("SELECT * FROM personas ORDER BY nombre").fetchall()
    sin_asignar = [p for p in todas_personas if p["id"] not in ids_asignados and p["id"] not in ids_respondieron]

    return render_template(
        "eventos/confirmaciones.html",
        evento=evento,
        respuestas=respuestas,
        pendientes=pendientes,
        sin_asignar=sin_asignar,
    )

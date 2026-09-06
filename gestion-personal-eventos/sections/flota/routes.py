from flask import Blueprint, render_template

from auth import login_required

bp = Blueprint("flota", __name__, url_prefix="/flota")


@bp.route("/")
@login_required
def index():
    return render_template(
        "proximamente.html",
        titulo="Flota",
        descripcion="Gestión de vehículos y su disponibilidad.",
    )

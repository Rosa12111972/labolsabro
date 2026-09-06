from flask import Blueprint, render_template

from auth import login_required

bp = Blueprint("lugares", __name__, url_prefix="/lugares")


@bp.route("/")
@login_required
def index():
    return render_template(
        "proximamente.html",
        titulo="Lugares / Venues",
        descripcion="Búsqueda y recomendación de espacios según tipo de evento y preferencias.",
    )

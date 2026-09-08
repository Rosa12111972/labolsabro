import os

from flask import Flask, redirect, url_for

import auth
from extensions import DB_PATH, close_db, create_default_admin, init_db, register_cli
from sections.eventos.routes import bp as eventos_bp
from sections.flota.routes import bp as flota_bp
from sections.lugares.routes import bp as lugares_bp
from sections.personal.routes import bp as personal_bp


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-key-cambia-esto-en-produccion")
    app.config["BASE_URL"] = os.environ.get("BASE_URL", "http://127.0.0.1:5000")
    app.config["GOOGLE_CLIENT_ID"] = os.environ.get("GOOGLE_CLIENT_ID", "")
    app.config["GOOGLE_CLIENT_SECRET"] = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    app.teardown_appcontext(close_db)
    register_cli(app)

    app.register_blueprint(auth.bp)
    app.register_blueprint(personal_bp)
    app.register_blueprint(eventos_bp)
    app.register_blueprint(flota_bp)
    app.register_blueprint(lugares_bp)

    @app.route("/")
    def index():
        return redirect(url_for("personal.buscar"))

    return app


app = create_app()


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        with app.app_context():
            init_db(app)
            create_default_admin()

    from scheduler import init_scheduler
    init_scheduler(app)

    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

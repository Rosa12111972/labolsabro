import os
import secrets
import sqlite3

import click
from flask import g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "instance", "personal.db")


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    db = get_db()
    with app.open_resource("schema.sql") as f:
        db.executescript(f.read().decode("utf8"))
    db.commit()


def create_default_admin():
    db = get_db()
    email = os.environ.get("ADMIN_EMAIL", "admin@local").strip().lower()
    password = (os.environ.get("ADMIN_PASSWORD") or "").strip() or secrets.token_urlsafe(9)
    from werkzeug.security import generate_password_hash

    db.execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        (email, generate_password_hash(password)),
    )
    db.commit()
    click.echo("=" * 60)
    click.echo("Base de datos inicializada por primera vez.")
    click.echo(f"Email: {email}")
    if os.environ.get("ADMIN_PASSWORD"):
        click.echo("Contraseña: la definida en la variable de entorno ADMIN_PASSWORD.")
    else:
        click.echo(f"Contraseña: {password}")
        click.echo("Guárdala ahora, no se volverá a mostrar (o define ADMIN_EMAIL/")
        click.echo("ADMIN_PASSWORD para tener credenciales fijas). Para crear más")
        click.echo('usuarios: flask --app app add-user <email> <contraseña>')
    click.echo("=" * 60)


def register_cli(app):
    @app.cli.command("init-db")
    def init_db_command():
        """Crea (o reinicia) las tablas de la base de datos."""
        init_db(app)
        create_default_admin()

    @app.cli.command("add-user")
    @click.argument("email")
    @click.argument("password")
    def add_user_command(email, password):
        """Crea un nuevo usuario para acceder a la herramienta."""
        from werkzeug.security import generate_password_hash

        db = get_db()
        try:
            db.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, generate_password_hash(password)),
            )
            db.commit()
            click.echo(f'Usuario "{email}" creado.')
        except sqlite3.IntegrityError:
            click.echo(f'Ya existe un usuario con email "{email}".')

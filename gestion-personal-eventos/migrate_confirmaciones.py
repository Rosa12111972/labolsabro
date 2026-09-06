"""Migración: añade codigo_acceso a eventos y crea la tabla confirmaciones.

Ejecutar una vez:
    python migrate_confirmaciones.py
"""
import os
import secrets
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance", "personal.db")


def generar_codigo():
    return secrets.token_urlsafe(6)[:8].upper()


def migrate():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")

    cols = [row[1] for row in db.execute("PRAGMA table_info(eventos)").fetchall()]
    if "codigo_acceso" not in cols:
        db.execute("ALTER TABLE eventos ADD COLUMN codigo_acceso TEXT UNIQUE")
        for row in db.execute("SELECT id FROM eventos").fetchall():
            db.execute("UPDATE eventos SET codigo_acceso = ? WHERE id = ?", (generar_codigo(), row[0]))
        print("Campo codigo_acceso añadido a eventos.")

    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if "confirmaciones" not in tables:
        db.execute("""
            CREATE TABLE confirmaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
                persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
                disponible INTEGER NOT NULL,
                disponible_desde TEXT,
                comentario TEXT,
                respondido_at TEXT NOT NULL,
                UNIQUE(evento_id, persona_id)
            )
        """)
        print("Tabla confirmaciones creada.")

    db.commit()
    db.close()
    print("Migración completada.")


if __name__ == "__main__":
    migrate()

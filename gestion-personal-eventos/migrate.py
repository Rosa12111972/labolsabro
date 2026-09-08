"""
Migration script: adds email to personas and creates evento_asignaciones table.
Run once: python migrate.py
"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance", "personal.db")


def migrate():
    if not os.path.exists(DB_PATH):
        print("No database found — nothing to migrate. Run the app to create it.")
        return

    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")

    cols = [row[1] for row in db.execute("PRAGMA table_info(personas)").fetchall()]
    if "email" not in cols:
        db.execute("ALTER TABLE personas ADD COLUMN email TEXT")
        print("Added 'email' column to personas.")
    else:
        print("'email' column already exists in personas.")

    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if "evento_asignaciones" not in tables:
        db.execute("""
            CREATE TABLE evento_asignaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
                persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
                asignado_at TEXT NOT NULL,
                email_enviado_at TEXT,
                recordatorio_enviado_at TEXT,
                UNIQUE(evento_id, persona_id)
            )
        """)
        print("Created 'evento_asignaciones' table.")
    else:
        print("'evento_asignaciones' table already exists.")

    user_cols = [row[1] for row in db.execute("PRAGMA table_info(users)").fetchall()]
    if "email" not in user_cols:
        db.execute("ALTER TABLE users ADD COLUMN email TEXT")
        if "username" in user_cols:
            db.execute("UPDATE users SET email = username WHERE email IS NULL")
        print("Added 'email' column to users.")
    else:
        print("'email' column already exists in users.")
    if "google_sub" not in user_cols:
        db.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
        print("Added 'google_sub' column to users.")
    else:
        print("'google_sub' column already exists in users.")

    db.commit()
    db.close()
    print("Migration complete.")


if __name__ == "__main__":
    migrate()

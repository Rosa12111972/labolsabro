import sqlite3
from datetime import datetime, timedelta

from extensions import DB_PATH
from email_service import enviar_recordatorio

REMINDER_AFTER_HOURS = 48


def check_pending_reminders(app):
    cutoff = (datetime.utcnow() - timedelta(hours=REMINDER_AFTER_HOURS)).isoformat()
    base_url = app.config.get("BASE_URL", "http://127.0.0.1:5000")

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")

    pending = db.execute("""
        SELECT a.id AS asig_id, a.evento_id, a.persona_id,
               p.nombre, p.email,
               e.nombre AS evento_nombre, e.fecha_inicio, e.codigo_acceso
        FROM evento_asignaciones a
        JOIN personas p ON p.id = a.persona_id
        JOIN eventos e ON e.id = a.evento_id
        WHERE a.asignado_at <= ?
          AND a.recordatorio_enviado_at IS NULL
          AND a.email_enviado_at IS NOT NULL
          AND e.estado IN ('en_negociacion', 'confirmado')
          AND e.fecha_inicio >= date('now')
          AND NOT EXISTS (
              SELECT 1 FROM confirmaciones c
              WHERE c.evento_id = a.evento_id AND c.persona_id = a.persona_id
          )
    """, (cutoff,)).fetchall()

    sent = 0
    for row in pending:
        if not row["email"]:
            continue
        try:
            ok = enviar_recordatorio(
                row["nombre"], row["email"], row["evento_nombre"],
                row["fecha_inicio"], row["codigo_acceso"], base_url,
            )
            if ok:
                db.execute(
                    "UPDATE evento_asignaciones SET recordatorio_enviado_at = ? WHERE id = ?",
                    (datetime.utcnow().isoformat(), row["asig_id"]),
                )
                db.commit()
                sent += 1
        except Exception as exc:
            print(f"[REMINDER] Error sending to {row['nombre']}: {exc}")

    db.close()
    if sent:
        print(f"[REMINDER] Sent {sent} reminders.")


def init_scheduler(app):
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        print("[SCHEDULER] APScheduler not installed — reminders disabled.")
        print("  Install with: pip install APScheduler")
        return None

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        check_pending_reminders,
        "interval",
        hours=1,
        args=[app],
        id="check_reminders",
        replace_existing=True,
    )
    scheduler.start()
    print("[SCHEDULER] Reminder checker running every hour.")
    return scheduler

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or SMTP_USER


def _send(to, subject, html_body):
    if not SMTP_USER or not SMTP_PASS:
        print(f"[EMAIL] SMTP not configured — would send to {to}: {subject}")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
    return True


def enviar_asignacion(persona_nombre, persona_email, evento_nombre, evento_fecha,
                      evento_ubicacion, codigo_acceso, base_url):
    link = f"{base_url}/eventos/confirmar/{codigo_acceso}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333;">Hola {persona_nombre},</h2>
      <p>Se te ha asignado al evento <strong>{evento_nombre}</strong>.</p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <tr><td style="padding: 6px 12px; color: #666;">Fecha</td><td style="padding: 6px 12px;"><strong>{evento_fecha}</strong></td></tr>
        <tr><td style="padding: 6px 12px; color: #666;">Ubicacion</td><td style="padding: 6px 12px;"><strong>{evento_ubicacion or 'Por confirmar'}</strong></td></tr>
        <tr><td style="padding: 6px 12px; color: #666;">Codigo</td><td style="padding: 6px 12px; font-family: monospace; font-size: 1.2em; letter-spacing: 0.1em;"><strong>{codigo_acceso}</strong></td></tr>
      </table>
      <p>Por favor, confirma tu disponibilidad haciendo clic en el siguiente enlace:</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="{link}" style="background: #5b87d6; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Confirmar disponibilidad
        </a>
      </p>
      <p style="color: #999; font-size: 0.85em;">O copia este enlace: {link}</p>
    </div>
    """
    subject = f"Confirma tu disponibilidad — {evento_nombre}"
    return _send(persona_email, subject, html)


def enviar_recordatorio(persona_nombre, persona_email, evento_nombre, evento_fecha,
                        codigo_acceso, base_url):
    link = f"{base_url}/eventos/confirmar/{codigo_acceso}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333;">Recordatorio para {persona_nombre}</h2>
      <p>Aun no has confirmado tu disponibilidad para el evento <strong>{evento_nombre}</strong> ({evento_fecha}).</p>
      <p>Por favor, confirma lo antes posible:</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="{link}" style="background: #d6875b; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Confirmar ahora
        </a>
      </p>
      <p style="color: #999; font-size: 0.85em;">Codigo de acceso: {codigo_acceso}</p>
    </div>
    """
    subject = f"Recordatorio: confirma disponibilidad — {evento_nombre}"
    return _send(persona_email, subject, html)

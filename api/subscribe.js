function paginaUnsubscribe(mensaje) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>laBolsabro</title></head>
    <body style="font-family: 'Helvetica Neue', Arial, sans-serif; background:#0a0a0a; color:#f0f0f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; text-align:center;">
      <div>
        <div style="font-size:40px;margin-bottom:16px">🪰</div>
        <h1 style="font-size:20px;margin-bottom:12px">${mensaje}</h1>
        <a href="https://labolsabro.com" style="color:#22c55e;font-weight:700;text-decoration:none">Volver a laBolsabro →</a>
      </div>
    </body>
    </html>
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const email = (req.query.email || '').trim();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!email || !email.includes('@')) {
      return res.status(400).send(paginaUnsubscribe('Enlace no válido.'));
    }
    if (!process.env.RESEND_AUDIENCE_ID) {
      return res.status(200).send(paginaUnsubscribe('Ya está — no recibirás más correos.'));
    }
    try {
      await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unsubscribed: true }),
      });
    } catch (e) {
      console.error('Resend unsubscribe error:', e);
    }
    return res.status(200).send(paginaUnsubscribe('Hecho — no recibirás más correos de laBolsabro.'));
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email no válido' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'laBolsabro <hola@labolsabro.com>',
        to: [email],
        subject: '¡Apuntado a laBolsabro! 🪰',
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; border-radius: 16px; overflow: hidden;">
            <div style="background: #facc15; padding: 24px; text-align: center;">
              <span style="font-size: 40px;">🪰</span>
              <div style="font-size: 22px; font-weight: 700; color: #000; margin-top: 8px;">laBolsabro</div>
            </div>
            <div style="padding: 32px 28px;">
              <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #f0f0f0;">¡Ya estás en la lista! 🎉</h1>
              <p style="font-size: 15px; color: #a3a3a3; line-height: 1.7; margin-bottom: 20px;">
                Gracias por apuntarte a <strong style="color: #f0f0f0;">laBolsabro</strong>. Serás de los primeros en enterarte cuando saquemos nuevas funciones y la versión premium.
              </p>
              <p style="font-size: 15px; color: #a3a3a3; line-height: 1.7; margin-bottom: 28px;">
                Mientras tanto, ya puedes usar el analizador de acciones gratuito en <a href="https://labolsabro.com" style="color: #22c55e;">labolsabro.com</a> — busca cualquier empresa y ve si está cara o barata en un vistazo.
              </p>
              <a href="https://labolsabro.com/guia.html" style="display: inline-block; background: #22c55e; color: #000; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 100px; text-decoration: none; margin-bottom: 12px;">📘 Leer la guía del principiante →</a>
              <br>
              <a href="https://labolsabro.com" style="display: inline-block; color: #a3a3a3; font-size: 13px; text-decoration: none;">o ir directo a laBolsabro →</a>
            </div>
            <div style="padding: 20px 28px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #525252; line-height: 1.6;">
              Recibes este email porque te apuntaste en labolsabro.com.
              Si no fuiste tú, ignora este mensaje.<br>
              © 2025 Mosca · <a href="https://labolsabro.com/privacidad.html" style="color: #525252;">Privacidad</a> · <a href="https://labolsabro.com/api/subscribe?email=${encodeURIComponent(email)}" style="color: #525252;">Darte de baja</a>
            </div>
          </div>
        `,
      }),
    });

    if (!r.ok) {
      const err = await r.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Error al enviar email' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error interno' });
  }
}

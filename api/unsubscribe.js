export default async function handler(req, res) {
  const email = (req.query.email || '').trim();

  const paginaHtml = (mensaje) => `
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

  if (!email || !email.includes('@')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(paginaHtml('Enlace no válido.'));
  }

  if (!process.env.RESEND_AUDIENCE_ID) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(paginaHtml('Ya está — no recibirás más correos.'));
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

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(paginaHtml('Hecho — no recibirás más correos de laBolsabro.'));
}

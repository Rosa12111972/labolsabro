export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
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
              <a href="https://labolsabro.com" style="display: inline-block; background: #22c55e; color: #000; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 100px; text-decoration: none;">Ir a laBolsabro →</a>
            </div>
            <div style="padding: 20px 28px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #525252; line-height: 1.6;">
              Recibes este email porque te apuntaste en labolsabro.com.
              Si no fuiste tú, ignora este mensaje.<br>
              © 2025 Mosca · <a href="https://labolsabro.com/privacidad.html" style="color: #525252;">Privacidad</a>
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

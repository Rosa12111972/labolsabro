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

  if (process.env.RESEND_AUDIENCE_ID) {
    try {
      await fetch(`https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    } catch (e) {
      console.error('Resend audience error:', e);
    }
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
        subject: '¡Bienvenida a laBolsabro! 🪰',
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; border-radius: 16px; overflow: hidden;">
            <div style="background: #facc15; padding: 24px; text-align: center;">
              <span style="font-size: 40px;">🪰</span>
              <div style="font-size: 22px; font-weight: 700; color: #000; margin-top: 8px;">laBolsabro</div>
            </div>
            <div style="padding: 32px 28px;">
              <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #f0f0f0;">¡Bienvenida! 🎉</h1>
              <p style="font-size: 15px; color: #a3a3a3; line-height: 1.7; margin-bottom: 24px;">
                Ya tienes tu cuenta en <strong style="color: #f0f0f0;">laBolsabro</strong>. Esto es lo que te espera:
              </p>

              <div style="background: #141414; border-radius: 12px; padding: 18px 20px; margin-bottom: 14px;">
                <div style="font-size: 15px; font-weight: 700; color: #f0f0f0; margin-bottom: 8px;">🚀 Primeros pasos</div>
                <p style="font-size: 13.5px; color: #a3a3a3; line-height: 1.6; margin: 0 0 10px;">
                  Regístrate, busca tu primera empresa, aprende a leer el semáforo de valor, prueba la calculadora de interés compuesto, haz tu primer nivel de DuoInvest y crea tu primer bote de ahorro. Todo en menos de 15 minutos.
                </p>
                <a href="https://labolsabro.com/primeros-pasos.html" style="color: #22c55e; font-size: 13.5px; font-weight: 700; text-decoration: none;">Ver primeros pasos →</a>
              </div>

              <div style="background: #141414; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <div style="font-size: 15px; font-weight: 700; color: #f0f0f0; margin-bottom: 8px;">📘 Guía del principiante</div>
                <p style="font-size: 13.5px; color: #a3a3a3; line-height: 1.6; margin: 0 0 10px;">
                  Los 10 puntos clave antes de invertir: fondo de emergencia, por qué el riesgo y la rentabilidad van juntos, diversificación, interés compuesto, cómo valorar una empresa y los errores típicos que hay que evitar.
                </p>
                <a href="https://labolsabro.com/guia.html" style="color: #22c55e; font-size: 13.5px; font-weight: 700; text-decoration: none;">Leer la guía →</a>
              </div>

              <p style="font-size: 13.5px; color: #a3a3a3; line-height: 1.6; margin-bottom: 24px;">
                Y cuando quieras pasar a la acción: el 🎮 <a href="https://labolsabro.com/ruta.html" style="color: #22c55e;">DuoInvest</a> (aprende jugando, con racha diaria) y el 🚦 <a href="https://labolsabro.com/#stocks" style="color: #22c55e;">analizador de acciones</a> (mira si una empresa está cara o barata en un vistazo) están siempre ahí.
              </p>

              <a href="https://labolsabro.com" style="display: inline-block; background: #22c55e; color: #000; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 100px; text-decoration: none;">Ir a laBolsabro →</a>
            </div>
            <div style="padding: 20px 28px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #525252; line-height: 1.6;">
              Recibes este email porque te has registrado en labolsabro.com. De vez en cuando te mandaremos novedades.
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

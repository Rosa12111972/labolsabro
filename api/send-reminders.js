export default async function handler(req, res) {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  const today = new Date();
  const dow = today.getDay(); // 0=domingo, 6=sabado
  const todayStr = today.toISOString().slice(0, 10);
  const esLaborable = dow >= 1 && dow <= 5;
  const esFinde = dow === 0 || dow === 6;

  const remRes = await fetch(`${supaUrl}/rest/v1/reminders?activo=eq.true&select=*`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
  });
  const reminders = await remRes.json();
  if (!Array.isArray(reminders) || !reminders.length) return res.json({ checked: 0, sent: 0 });

  let sentCount = 0;
  for (const r of reminders) {
    if (r.ultimo_envio === todayStr) continue;
    if (r.frecuencia === 'laborables' && !esLaborable) continue;
    if (r.frecuencia === 'findes' && !esFinde) continue;

    try {
      const userRes = await fetch(`${supaUrl}/auth/v1/admin/users/${r.user_id}`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
      });
      const userData = await userRes.json();
      const email = userData?.email;

      const profRes = await fetch(`${supaUrl}/rest/v1/profiles?id=eq.${r.user_id}&select=racha_dias,ultima_actividad`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
      });
      const profData = await profRes.json();
      const prof = profData?.[0];
      const rachaActiva = prof?.racha_dias > 0 && prof?.ultima_actividad !== todayStr;
      const rachaHtml = rachaActiva
        ? `<p style="color:#eab308;font-weight:600">🔥 Llevas ${prof.racha_dias} día${prof.racha_dias === 1 ? '' : 's'} seguidos. Entra hoy en la <a href="https://labolsabro.com/ruta.html">ruta de aprendizaje</a> para no perder la racha.</p>`
        : '';

      if (email && process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'laBolsabro <hola@labolsabro.com>',
            to: email,
            subject: rachaActiva ? `🔥 No pierdas tu racha de ${prof.racha_dias} días` : '🪰 Tu recordatorio de laBolsabro',
            html: `<p>${r.mensaje}</p>${rachaHtml}<p style="color:#999;font-size:12px">Puedes gestionar tus recordatorios en labolsabro.com</p>`
          })
        });
      }
    } catch (e) {}

    await fetch(`${supaUrl}/rest/v1/reminders?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ultimo_envio: todayStr }),
    });
    sentCount++;
  }

  return res.json({ checked: reminders.length, sent: sentCount });
}

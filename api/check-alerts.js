export default async function handler(req, res) {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  const alertsRes = await fetch(`${supaUrl}/rest/v1/price_alerts?triggered=eq.false&select=*`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
  });
  const alerts = await alertsRes.json();
  if (!Array.isArray(alerts) || !alerts.length) return res.json({ checked: 0, triggered: 0 });

  const tickers = [...new Set(alerts.map(a => a.ticker))];
  const prices = {};
  for (const t of tickers) {
    try {
      const r = await fetch(`https://${req.headers.host}/api/stock?ticker=${encodeURIComponent(t)}`);
      const d = await r.json();
      if (d && d.precio) prices[t] = d.precio;
    } catch (e) {}
  }

  let triggeredCount = 0;
  for (const a of alerts) {
    const price = prices[a.ticker];
    if (price == null) continue;
    const hit = a.direction === 'above' ? price >= a.target_price : price <= a.target_price;
    if (!hit) continue;

    try {
      const userRes = await fetch(`${supaUrl}/auth/v1/admin/users/${a.user_id}`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
      });
      const userData = await userRes.json();
      const email = userData?.email;

      if (email && process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'laBolsabro <hola@labolsabro.com>',
            to: email,
            subject: `🪰 ${a.ticker} ha ${a.direction === 'above' ? 'subido por encima de' : 'bajado por debajo de'} ${a.target_price}€`,
            html: `<p>${a.nombre || a.ticker} está ahora a <strong>${price}€</strong>. Tu alerta de laBolsabro se ha activado.</p>`
          })
        });
      }
    } catch (e) {}

    await fetch(`${supaUrl}/rest/v1/price_alerts?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ triggered: true }),
    });
    triggeredCount++;
  }

  return res.json({ checked: alerts.length, triggered: triggeredCount });
}

export default async function handler(req, res) {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_KEY;

  const alertsRes = await fetch(`${supaUrl}/rest/v1/price_alerts?triggered=eq.false&select=*`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
  });
  const alerts = await alertsRes.json();
  if (!Array.isArray(alerts) || !alerts.length) return res.json({ checked: 0, triggered: 0 });

  const SIMBOLOS_MONEDA = { USD:'$', EUR:'€', MXN:'MX$', JPY:'¥', GBP:'£', BRL:'R$', CAD:'CA$', CHF:'CHF', CNY:'¥', INR:'₹', ARS:'AR$', COP:'COP$', CLP:'CLP$', PEN:'S/' };
  const fmtPrecio = (valor, moneda) => {
    const sym = SIMBOLOS_MONEDA[moneda] || '';
    return moneda === 'EUR' ? `${valor} ${sym}` : `${sym}${valor}`;
  };

  const tickers = [...new Set(alerts.map(a => a.ticker))];
  const prices = {};
  for (const t of tickers) {
    try {
      const r = await fetch(`https://${req.headers.host}/api/stock?ticker=${encodeURIComponent(t)}`, {
        headers: process.env.CRON_SECRET ? { 'x-cron-secret': process.env.CRON_SECRET } : {}
      });
      const d = await r.json();
      if (d && d.precio) prices[t] = { precio: d.precio, moneda: d.moneda || 'USD' };
    } catch (e) {}
  }

  let triggeredCount = 0;
  for (const a of alerts) {
    const info = prices[a.ticker];
    if (!info) continue;
    const price = info.precio;
    const moneda = a.moneda || info.moneda || 'EUR';
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
            subject: `🪰 ${a.ticker} ha ${a.direction === 'above' ? 'subido por encima de' : 'bajado por debajo de'} ${fmtPrecio(a.target_price, moneda)}`,
            html: `<p>${a.nombre || a.ticker} está ahora a <strong>${fmtPrecio(price, moneda)}</strong>. Tu alerta de laBolsabro se ha activado.</p>`
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

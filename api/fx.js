let _fxCache = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (_fxCache && Date.now() - _fxCache.ts < 6 * 60 * 60 * 1000) {
    return res.json(_fxCache.data);
  }
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const raw = await r.json();
    if (!raw.rates) throw new Error('sin rates');
    const data = { base: 'USD', rates: raw.rates };
    _fxCache = { data, ts: Date.now() };
    return res.json(data);
  } catch (e) {
    if (_fxCache) return res.json(_fxCache.data);
    return res.status(500).json({ error: 'No se pudo obtener el tipo de cambio' });
  }
}

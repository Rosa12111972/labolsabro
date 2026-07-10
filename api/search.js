export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ quotes: [] });

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=7&newsCount=0&enableFuzzyQuery=true`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
    });
    const data = await r.json();
    const quotes = (data.quotes || [])
      .filter(x => x.symbol && ['EQUITY','CRYPTOCURRENCY','ETF'].includes(x.quoteType))
      .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, type: x.quoteType, exchange: x.exchange || '' }));
    return res.json({ quotes });
  } catch(e) {
    return res.json({ quotes: [] });
  }
}

const CRYPTO_INFO = {
  'BTC-USD': { nombre:'Bitcoin', tipo:'Reserva de valor', riesgo:'Alto', viabilidad:'Establecida', rankMcap:1, descripcion:'La primera criptomoneda. Reserva de valor digital con oferta limitada a 21 millones de unidades.' },
  'ETH-USD': { nombre:'Ethereum', tipo:'Smart Contracts', riesgo:'Alto', viabilidad:'Establecida', rankMcap:2, descripcion:'Plataforma de contratos inteligentes. Base de la mayoría de aplicaciones descentralizadas y DeFi.' },
  'SOL-USD': { nombre:'Solana', tipo:'Smart Contracts', riesgo:'Muy alto', viabilidad:'Creciente', rankMcap:5, descripcion:'Blockchain de alta velocidad y bajo coste. Competidor directo de Ethereum con gran adopción en NFTs.' },
  'BNB-USD': { nombre:'BNB', tipo:'Exchange Token', riesgo:'Muy alto', viabilidad:'Creciente', rankMcap:4, descripcion:'Token nativo de Binance. Su valor está ligado al uso del mayor exchange de criptomonedas del mundo.' },
  'XRP-USD': { nombre:'XRP', tipo:'Pagos', riesgo:'Muy alto', viabilidad:'Incierta', rankMcap:7, descripcion:'Diseñado para transferencias internacionales rápidas. Ha tenido conflictos legales con la SEC de EEUU.' },
  'DOGE-USD': { nombre:'Dogecoin', tipo:'Meme coin', riesgo:'Extremo', viabilidad:'Especulativa', rankMcap:8, descripcion:'Empezó como broma en 2013. Su precio depende en gran medida de las redes sociales y figuras públicas.' },
  'ADA-USD': { nombre:'Cardano', tipo:'Smart Contracts', riesgo:'Muy alto', viabilidad:'Incierta', rankMcap:10, descripcion:'Blockchain con enfoque académico y científico. Desarrollo más lento pero más riguroso que competidores.' },
  'SHIB-USD': { nombre:'Shiba Inu', tipo:'Meme coin', riesgo:'Extremo', viabilidad:'Especulativa', rankMcap:15, descripcion:'Meme coin creada en 2020. Altísima volatilidad y valor especulativo sin utilidad clara.' },
};

const CRYPTO_TICKERS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','SHIB'];
let _crumbCache = null;

async function getYahooCrumb() {
  if (_crumbCache && Date.now() - _crumbCache.ts < 50 * 60 * 1000) return _crumbCache;
  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };
  const r1 = await fetch('https://finance.yahoo.com/', { headers: hdrs });
  const cookies = r1.headers.get('set-cookie') || '';
  const cookieStr = cookies.split(',').map(c => c.split(';')[0]).join('; ');
  const hdrs2 = { ...hdrs, 'Cookie': cookieStr };
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: hdrs2 });
  const crumb = await r2.text();
  _crumbCache = { crumb, cookies: cookieStr, ts: Date.now() };
  return _crumbCache;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const raw = (req.query.ticker || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!raw) return res.status(400).json({ error: 'Ticker requerido' });

  const isCrypto = CRYPTO_TICKERS.includes(raw);
  const yTicker = isCrypto ? raw + '-USD' : raw;

  try {
    const { crumb, cookies } = await getYahooCrumb();
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yTicker)}?modules=summaryDetail,price,assetProfile,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': cookies
      }
    });

    if (!r.ok) return res.status(404).json({ error: `No encontramos '${raw}'` });

    const json = await r.json();
    const qs = json?.quoteSummary?.result?.[0];
    if (!qs) return res.status(404).json({ error: `No encontramos '${raw}'` });

    const price = qs.price || {};
    const sd = qs.summaryDetail || {};
    const ks = qs.defaultKeyStatistics || {};
    const fd = qs.financialData || {};
    const ap = qs.assetProfile || {};
    const v = x => (x && x.raw !== undefined ? x.raw : null);

    const nombre = price.shortName || price.longName || raw;
    const precio = v(price.regularMarketPrice);
    const cambio = v(price.regularMarketChangePercent);
    const mktCap = v(price.marketCap);
    const moneda = price.currency || 'USD';

    if (isCrypto) {
      const info = CRYPTO_INFO[yTicker] || {};
      return res.json({ tipo:'crypto', ticker:raw, nombre, precio, cambio, mktCap, moneda, viabilidad:info.viabilidad||'—', riesgo:info.riesgo||'—', rankMcap:info.rankMcap||null, tipoCrypto:info.tipo||'—', descripcion:info.descripcion||'' });
    }

    return res.json({
      tipo: 'stock', ticker: raw, nombre, precio, cambio, mktCap, moneda,

      // Valoración
      pe:          v(sd.trailingPE),
      fpe:         v(sd.forwardPE),
      peg:         v(ks.pegRatio),
      pb:          v(ks.priceToBook),
      evEbitda:    v(ks.enterpriseToEbitda),
      evRevenue:   v(ks.enterpriseToRevenue),

      // Rentabilidad
      eps:         v(ks.trailingEps),
      margen:      v(fd.profitMargins),
      roe:         v(fd.returnOnEquity),
      roa:         v(fd.returnOnAssets),
      crecimientoEps: v(ks.earningsQuarterlyGrowth),
      crecimientoIng: v(fd.revenueGrowth),
      totalRevenue:   v(fd.totalRevenue),

      // Reinversión y dividendo
      payoutRatio:        v(sd.payoutRatio),
      freeCashflow:       v(fd.freeCashflow),
      operatingCashflow:  v(fd.operatingCashflow),
      capitalExpenditures: v(fd.capitalExpenditures),
      divY:          v(sd.dividendYield),
      dividendRate:  v(sd.dividendRate),

      // Salud financiera
      debtToEquity: v(fd.debtToEquity),
      currentRatio: v(fd.currentRatio),
      quickRatio:   v(fd.quickRatio),
      totalDebt:    v(fd.totalDebt),
      totalCash:    v(fd.totalCash),

      // Mercado
      beta:    v(sd.beta),
      min52:   v(sd.fiftyTwoWeekLow),
      max52:   v(sd.fiftyTwoWeekHigh),

      // Empresa
      sector:    ap.sector || '',
      industry:  ap.industry || '',
      employees: ap.fullTimeEmployees || null,
    });
  } catch(e) {
    return res.status(500).json({ error: 'Error al obtener datos: ' + e.message });
  }
}

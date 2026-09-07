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

const ipLimits = new Map();
const LIMIT = 3;

function getIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function checkIpLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const rec = ipLimits.get(ip);
  if (!rec || rec.date !== today) {
    ipLimits.set(ip, { date: today, count: 1 });
    return true;
  }
  if (rec.count >= LIMIT) return false;
  rec.count++;
  return true;
}

async function esPremium(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    if (!user?.id) return false;
    const profRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=plan,premium_bonus_until`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const prof = await profRes.json();
    const p = prof?.[0];
    if (!p) return false;
    const bonusActivo = p.premium_bonus_until && new Date(p.premium_bonus_until) > new Date();
    return p.plan !== 'free' || bonusActivo;
  } catch (e) { return false; }
}

// Alpha Vantage: fuente con licencia real (sustituye al scraping de Yahoo Finance).
// Free tier: ~25 peticiones/día compartidas por toda la web. Cada análisis usa 2
// (GLOBAL_QUOTE + OVERVIEW), así que el límite real es de unos ~12 análisis nuevos
// al día en el plan gratuito de Alpha Vantage (los resultados ya cacheados en el
// navegador del usuario no cuentan). Si el tráfico crece, hay que subir de plan
// en alphavantage.co — no hace falta cambiar código, solo la clave sigue igual.
const AV_BASE = 'https://www.alphavantage.co/query';

function n(x) {
  if (x === undefined || x === null || x === '' || x === 'None') return null;
  const v = parseFloat(x);
  return Number.isNaN(v) ? null : v;
}

async function avFetch(params) {
  const url = `${AV_BASE}?${new URLSearchParams({ ...params, apikey: process.env.ALPHA_VANTAGE_KEY }).toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Alpha Vantage no disponible');
  const json = await r.json();
  if (json.Note || json.Information) throw new Error('Límite diario de Alpha Vantage alcanzado, inténtalo más tarde');
  return json;
}

async function fetchStock(ticker) {
  const [quoteRes, overviewRes] = await Promise.all([
    avFetch({ function: 'GLOBAL_QUOTE', symbol: ticker }),
    avFetch({ function: 'OVERVIEW', symbol: ticker }),
  ]);
  const q = quoteRes['Global Quote'] || {};
  const o = overviewRes || {};
  if (!q['05. price'] && !o.Symbol) return null;

  const nombre = o.Name || ticker;
  const precio = n(q['05. price']);
  const cambioPctStr = (q['10. change percent'] || '').replace('%', '');
  const cambio = n(cambioPctStr);
  const mktCap = n(o.MarketCapitalization);
  const moneda = o.Currency || 'USD';
  const dividendPerShare = n(o.DividendPerShare);
  const eps = n(o.EPS);

  return {
    tipo: 'stock', ticker, nombre, precio, cambio, mktCap, moneda,

    // Valoración
    pe:          n(o.TrailingPE) ?? n(o.PERatio),
    fpe:         n(o.ForwardPE),
    peg:         n(o.PEGRatio),
    pb:          n(o.PriceToBookRatio),
    evEbitda:    n(o.EVToEBITDA),
    evRevenue:   n(o.EVToRevenue),

    // Rentabilidad
    eps:         eps,
    margen:      n(o.ProfitMargin),
    roe:         n(o.ReturnOnEquityTTM),
    roa:         n(o.ReturnOnAssetsTTM),
    crecimientoEps: n(o.QuarterlyEarningsGrowthYOY),
    crecimientoIng: n(o.QuarterlyRevenueGrowthYOY),
    totalRevenue:   n(o.RevenueTTM),

    // Reinversión y dividendo
    payoutRatio:        (dividendPerShare != null && eps) ? dividendPerShare / eps : null,
    freeCashflow:        null, // no disponible sin llamada extra (BALANCE_SHEET/CASH_FLOW) — limitado por cuota gratuita
    operatingCashflow:   null,
    capitalExpenditures: null,
    divY:          n(o.DividendYield),
    dividendRate:  dividendPerShare,

    // Salud financiera (no disponibles en el plan gratuito sin llamadas adicionales)
    debtToEquity: null,
    currentRatio: null,
    quickRatio:   null,
    totalDebt:    null,
    totalCash:    null,

    // Mercado
    beta:    n(o.Beta),
    min52:   n(o['52WeekLow']),
    max52:   n(o['52WeekHigh']),

    // Empresa
    sector:    o.Sector || '',
    industry:  o.Industry || '',
    employees: o.FullTimeEmployees ? parseInt(o.FullTimeEmployees) : null,
  };
}

async function fetchCrypto(raw, yTicker) {
  const symbol = raw;
  const res = await avFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: symbol, to_currency: 'USD' });
  const r = res['Realtime Currency Exchange Rate'];
  if (!r) return null;
  const info = CRYPTO_INFO[yTicker] || {};
  const precio = n(r['5. Exchange Rate']);
  return {
    tipo: 'crypto', ticker: raw, nombre: info.nombre || raw, precio,
    cambio: null, // no disponible sin una llamada extra (limitado por cuota gratuita)
    mktCap: null, moneda: 'USD',
    viabilidad: info.viabilidad || '—', riesgo: info.riesgo || '—',
    rankMcap: info.rankMcap || null, tipoCrypto: info.tipo || '—', descripcion: info.descripcion || ''
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!process.env.ALPHA_VANTAGE_KEY) {
    return res.status(500).json({ error: 'Fuente de datos no configurada (falta ALPHA_VANTAGE_KEY)' });
  }

  if (!(await esPremium(req))) {
    const ip = getIp(req);
    if (!checkIpLimit(ip)) {
      return res.status(429).json({ error: 'Límite diario alcanzado', limitAlcanzado: true });
    }
  }

  const raw = (req.query.ticker || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!raw) return res.status(400).json({ error: 'Ticker requerido' });

  const isCrypto = CRYPTO_TICKERS.includes(raw);
  const yTicker = isCrypto ? raw + '-USD' : raw;

  try {
    const data = isCrypto ? await fetchCrypto(raw, yTicker) : await fetchStock(raw);
    if (!data) return res.status(404).json({ error: `No encontramos '${raw}'` });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Error al obtener datos: ' + e.message });
  }
}

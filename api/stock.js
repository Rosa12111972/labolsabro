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

// Financial Modeling Prep: fuente con licencia real (sustituye al scraping de
// Yahoo Finance, y antes de eso a Alpha Vantage). Free tier: ~250 peticiones/día
// compartidas por toda la web. Cada análisis usa 2 (profile + ratios-ttm), así
// que el límite real es de unos ~125 análisis nuevos al día en el plan gratuito
// (los resultados ya cacheados en el navegador del usuario no cuentan). Si el
// tráfico crece, hay que subir de plan en financialmodelingprep.com — no hace
// falta cambiar código, solo la clave sigue igual.
// Usa la API "stable" (query params) — la antigua /api/v3 (path params) dejó
// de estar disponible para claves nuevas a partir del 31/08/2025.
const FMP_BASE = 'https://financialmodelingprep.com/stable';

function n(x) {
  if (x === undefined || x === null || x === '') return null;
  const v = parseFloat(x);
  return Number.isNaN(v) ? null : v;
}

// Distintas versiones de la API de FMP han usado nombres de campo distintos
// para lo mismo (p.ej. mktCap vs marketCap). pick() prueba varios nombres.
function pick(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

async function fmpFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${FMP_BASE}${path}${sep}apikey=${process.env.FMP_API_KEY}`;
  const r = await fetch(url);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  if (json && json['Error Message']) throw new Error(json['Error Message']);
  if (json && !Array.isArray(json) && json.error) throw new Error(String(json.error));
  if (!r.ok) throw new Error(`Financial Modeling Prep no disponible (HTTP ${r.status}): ${text.slice(0, 200)}`);
  return json;
}

async function fetchStock(ticker) {
  const [profileArr, ratiosArr] = await Promise.all([
    fmpFetch(`/profile?symbol=${encodeURIComponent(ticker)}`),
    fmpFetch(`/ratios-ttm?symbol=${encodeURIComponent(ticker)}`),
  ]);
  const p = Array.isArray(profileArr) ? profileArr[0] : null;
  const r = Array.isArray(ratiosArr) ? ratiosArr[0] : null;
  const precio = n(pick(p, ['price']));
  if (!p || !precio) return null;

  const [min52, max52] = (p.range || '').split('-').map(n);

  return {
    tipo: 'stock', ticker, nombre: p.companyName || ticker,
    precio, cambio: n(pick(p, ['changePercentage', 'changesPercentage'])), mktCap: n(pick(p, ['marketCap', 'mktCap'])), moneda: p.currency || 'USD',

    // Valoración
    pe:          n(pick(r, ['peRatioTTM', 'priceToEarningsRatioTTM'])),
    fpe:         null,
    peg:         n(pick(r, ['pegRatioTTM', 'priceToEarningsGrowthRatioTTM'])),
    pb:          n(pick(r, ['priceToBookRatioTTM'])),
    evEbitda:    n(pick(r, ['enterpriseValueMultipleTTM', 'evToEBITDATTM'])),
    evRevenue:   n(pick(r, ['evToSalesTTM'])),

    // Rentabilidad
    eps:         n(pick(p, ['eps'])) ?? n(pick(r, ['netIncomePerShareTTM'])),
    margen:      n(pick(r, ['netProfitMarginTTM'])),
    roe:         n(pick(r, ['returnOnEquityTTM'])),
    roa:         n(pick(r, ['returnOnAssetsTTM'])),
    crecimientoEps: null,
    crecimientoIng: null,
    totalRevenue:   null,

    // Reinversión y dividendo
    payoutRatio:         n(pick(r, ['payoutRatioTTM'])),
    freeCashflow:        null, // no disponible sin llamada extra (cash-flow-statement) — limitado por cuota gratuita
    operatingCashflow:   null,
    capitalExpenditures: null,
    divY:          n(pick(r, ['dividendYieldTTM'])),
    dividendRate:  n(pick(p, ['lastDividend', 'lastDiv'])),

    // Salud financiera
    debtToEquity: n(pick(r, ['debtToEquityRatioTTM', 'debtEquityRatioTTM'])),
    currentRatio: n(pick(r, ['currentRatioTTM'])),
    quickRatio:   n(pick(r, ['quickRatioTTM'])),
    totalDebt:    null,
    totalCash:    null,

    // Mercado
    beta:  n(p.beta),
    min52: min52 ?? null,
    max52: max52 ?? null,

    // Empresa
    sector:    p.sector || '',
    industry:  p.industry || '',
    employees: p.fullTimeEmployees ? parseInt(p.fullTimeEmployees) : null,
  };
}

async function fetchCrypto(raw, yTicker) {
  const arr = await fmpFetch(`/quote?symbol=${encodeURIComponent(raw)}USD`);
  const q = Array.isArray(arr) ? arr[0] : null;
  const precio = n(pick(q, ['price']));
  if (!q || !precio) return null;
  const info = CRYPTO_INFO[yTicker] || {};
  return {
    tipo: 'crypto', ticker: raw, nombre: info.nombre || raw, precio,
    cambio: n(pick(q, ['changePercentage', 'changesPercentage'])), mktCap: n(pick(q, ['marketCap', 'mktCap'])), moneda: 'USD',
    viabilidad: info.viabilidad || '—', riesgo: info.riesgo || '—',
    rankMcap: info.rankMcap || null, tipoCrypto: info.tipo || '—', descripcion: info.descripcion || ''
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!process.env.FMP_API_KEY) {
    return res.status(500).json({ error: 'Fuente de datos no configurada (falta FMP_API_KEY)' });
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

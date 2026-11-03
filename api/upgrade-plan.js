import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  junior: 'price_1Ty9Nl8oxHMJgjKmHeRoQ3Rm',
  senior: 'price_1Ty9Ol8oxHMJgjKmf7t5janm',
  junior_anual: 'price_1U43ij8oxHMJgjKmsWKJGMNm',
  senior_anual: 'price_1U43jR8oxHMJgjKmfdw93vWC',
};

async function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user?.id || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { plan, anual } = req.body || {};
  const planKey = anual ? `${plan}_anual` : plan;
  const newPriceId = PRICES[planKey];
  if (!newPriceId) return res.status(400).json({ error: 'Plan no válido' });

  try {
    const profRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_subscription_id,plan`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const prof = (await profRes.json())?.[0];
    const subscriptionId = prof?.stripe_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'No tienes una suscripción activa para cambiar de plan' });

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'No se encontró el ítem de suscripción' });

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'always_invoice',
    });

    return res.json({ ok: true, plan: planKey, status: updated.status });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al cambiar de plan' });
  }
}

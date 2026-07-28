import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  junior: 'price_1Ty9Nl8oxHMJgjKmHeRoQ3Rm',
  senior: 'price_1Ty9Ol8oxHMJgjKmf7t5janm',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, userId, email } = req.body || {};
  const priceId = PRICES[plan];
  if (!priceId) return res.status(400).json({ error: 'Plan no válido' });

  try {
    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://labolsabro.com/premium.html?success=1',
      cancel_url: 'https://labolsabro.com/premium.html?cancelled=1',
      locale: 'es',
    };
    if (userId) sessionParams.client_reference_id = userId;
    if (email) sessionParams.customer_email = email;
    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al crear sesión de pago' });
  }
}

import Stripe from 'stripe';

const PRICES = {
  'price_1Ty9Nl8oxHMJgjKmHeRoQ3Rm': 'junior',
  'price_1Ty9Ol8oxHMJgjKmf7t5janm': 'senior',
};

async function supabasePatch(path, data) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const subscriptionId = session.subscription;
    const customerId = session.customer;

    if (userId && subscriptionId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price?.id;
      const plan = PRICES[priceId] || 'junior';

      await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          id: userId,
          plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await supabasePatch(`profiles?stripe_customer_id=eq.${sub.customer}`, { plan: 'free' });
  }

  return res.json({ received: true });
}

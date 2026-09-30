import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// ---- Stripe fake: each checkout session's state is set per test. ----
const stripeState = vi.hoisted(() => ({
  sessions: new Map<string, { payment_status: string; status: string; url: string | null; orderId: string }>(),
  down: false,
}));

vi.mock('../src/config/stripe.js', () => {
  const fake = {
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id: string) => {
          if (stripeState.down) throw new Error('Stripe unavailable');
          const s = stripeState.sessions.get(id);
          if (!s) throw new Error('No such checkout session');
          return {
            id,
            object: 'checkout.session',
            payment_status: s.payment_status,
            status: s.status,
            url: s.url,
            payment_intent: `pi_${id}`,
            amount_subtotal: 3_000,
            amount_total: 3_000,
            total_details: { amount_tax: 0, amount_shipping: 0 },
            metadata: { orderId: s.orderId },
          };
        }),
      },
    },
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({
        id,
        amount_received: 3_000,
        currency: 'usd',
        latest_charge: { id: `ch_${id}`, balance_transaction: { id: `txn_${id}`, fee: 117, net: 2_883 } },
      })),
    },
  };
  return { getStripe: () => fake };
});

import EmailLog from '../src/models/EmailLog.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';
import { app, PASSWORD, uniqueEmail } from './helpers.js';

beforeEach(() => {
  stripeState.sessions.clear();
  stripeState.down = false;
});

async function shopper() {
  const email = uniqueEmail('shopper');
  await User.create({ name: 'Kofi Boateng', email, password: PASSWORD });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  const user = (await User.findOne({ email }))!;
  const token = res.body.token as string;
  const get = (path: string) => request(app).get(`/api/${path}`).set('Authorization', `Bearer ${token}`);
  const post = (path: string, body: object) => request(app).post(`/api/${path}`).set('Authorization', `Bearer ${token}`).send(body);
  return { user, get, post };
}

/** An order left pending at checkout, with its Stripe session in the given state. */
async function checkout(userId: unknown, session: { payment_status: string; status: string; url?: string }) {
  const product = await Product.create({ name: 'Linen Shirt', price: 3_000, stock: 10 });
  const order = await Order.create({
    user: userId,
    items: [{ product: product._id, name: 'Linen Shirt', price: 3_000, quantity: 1 }],
    total: 3_000,
    stripeSessionId: `cs_${product.id}`,
  });
  stripeState.sessions.set(order.stripeSessionId!, { ...session, url: session.url ?? null, orderId: order.id });
  return { order, product };
}

describe('customer orders without the webhook', () => {
  it('marks a paid checkout as paid when the customer opens their orders, once', async () => {
    const me = await shopper();
    const { order, product } = await checkout(me.user._id, { payment_status: 'paid', status: 'complete' });

    const res = await me.get('orders/mine').expect(200);
    expect(res.body.orders).toMatchObject([{ _id: order.id, status: 'paid' }]);
    expect(res.body.orders[0]).not.toHaveProperty('payment');
    await me.get('orders/mine').expect(200);

    expect((await Product.findById(product._id))?.stock).toBe(9);
    expect(await EmailLog.countDocuments({ order: order._id, template: 'order_confirmation' })).toBe(1);
  });

  it('lists an unfinished checkout with a link to finish paying', async () => {
    const me = await shopper();
    const { order } = await checkout(me.user._id, { payment_status: 'unpaid', status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const res = await me.get('orders/mine').expect(200);
    expect(res.body.orders).toMatchObject([{ _id: order.id, status: 'pending', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_1' }]);
  });

  it('cancels expired checkouts and keeps them out of the history', async () => {
    const me = await shopper();
    const { order } = await checkout(me.user._id, { payment_status: 'unpaid', status: 'expired' });
    expect((await me.get('orders/mine').expect(200)).body.orders).toEqual([]);
    expect((await Order.findById(order._id))?.status).toBe('cancelled');
  });

  it('still loads when Stripe is unreachable', async () => {
    const me = await shopper();
    const { order } = await checkout(me.user._id, { payment_status: 'paid', status: 'complete' });
    stripeState.down = true;
    expect((await me.get('orders/mine').expect(200)).body.orders).toEqual([]);
    expect((await Order.findById(order._id))?.status).toBe('pending');
  });

  it('confirms the payment from the success page, for the customer’s own session only', async () => {
    const me = await shopper();
    const { order } = await checkout(me.user._id, { payment_status: 'paid', status: 'complete' });
    const res = await me.post('checkout/confirm', { sessionId: order.stripeSessionId }).expect(200);
    expect(res.body.order).toMatchObject({ _id: order.id, status: 'paid' });

    const other = await shopper();
    await other.post('checkout/confirm', { sessionId: order.stripeSessionId }).expect(404);
  });

  it('counts orders on their way for the header, and hides other people’s orders', async () => {
    const me = await shopper();
    const { order } = await checkout(me.user._id, { payment_status: 'paid', status: 'complete' });
    await me.get(`orders/${order.id}`).expect(200);
    expect((await me.get('orders/mine/summary').expect(200)).body).toEqual({ active: 1 });

    const other = await shopper();
    await other.get(`orders/${order.id}`).expect(404);
  });
});

import { describe, expect, it } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';
import { app, customerToken, PASSWORD, uniqueEmail } from './helpers.js';

describe('catalogue', () => {
  it('paginates and tolerates junk query params', async () => {
    await Product.create([
      { name: 'A', price: 100, stock: 1 },
      { name: 'B', price: 200, stock: 1 },
    ]);
    const res = await request(app).get('/api/products?page=abc&limit=1').expect(200);
    expect(res.body).toMatchObject({ page: 1, pages: 2, total: 2 });
    expect(res.body.products).toHaveLength(1);
  });
});

describe('checkout validation', () => {
  it('requires a signed-in customer', async () => {
    await request(app).post('/api/checkout').send({ items: [] }).expect(401);
  });

  it('rejects empty carts, bad ids and bad quantities before touching Stripe', async () => {
    const token = await customerToken();
    const post = (body: unknown) => request(app).post('/api/checkout').set('Authorization', `Bearer ${token}`).send(body as object);

    expect((await post({ items: [] })).body.message).toBe('Cart is empty');
    expect((await post({})).body.message).toBe('Cart is empty');
    expect((await post({ items: [{ productId: 'nope', quantity: 1 }] })).status).toBe(400);
    const p = await Product.create({ name: 'A', price: 100, stock: 1 });
    expect((await post({ items: [{ productId: p.id, quantity: 0 }] })).status).toBe(400);
    expect((await post({ items: [{ productId: p.id, quantity: 5 }] })).body.message).toMatch(/Only 1/);
  });
});

describe('stripe webhook', () => {
  const stripe = new Stripe('sk_test_dummy');

  async function pendingOrder() {
    const user = await User.create({ name: 'C', email: uniqueEmail(), password: PASSWORD });
    const product = await Product.create({ name: 'Mug', price: 1200, stock: 10 });
    const order = await Order.create({
      user: user._id,
      items: [{ product: product._id, name: product.name, price: product.price, quantity: 3 }],
      total: 3600,
    });
    return { order, product };
  }

  const send = (event: object, secret = process.env.STRIPE_WEBHOOK_SECRET!) => {
    const payload = JSON.stringify(event);
    return request(app)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', stripe.webhooks.generateTestHeaderString({ payload, secret }))
      .send(payload);
  };

  const completed = (orderId: string) => ({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        payment_status: 'paid',
        metadata: { orderId },
        shipping_details: { name: 'Ann', address: { line1: '1 Main St', city: 'Springfield', country: 'US', postal_code: '12345' } },
      },
    },
  });

  it('rejects a bad signature', async () => {
    const { order } = await pendingOrder();
    await send(completed(order.id), 'whsec_wrong').expect(400);
    expect((await Order.findById(order.id))?.status).toBe('pending');
  });

  it('marks the order paid and decrements stock exactly once', async () => {
    const { order, product } = await pendingOrder();
    await send(completed(order.id)).expect(200);
    await send(completed(order.id)).expect(200); // Stripe retry

    const paid = await Order.findById(order.id);
    expect(paid?.status).toBe('paid');
    expect(paid?.shippingAddress?.city).toBe('Springfield');
    expect((await Product.findById(product.id))?.stock).toBe(7);
  });
});

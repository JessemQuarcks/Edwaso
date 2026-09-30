import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import type { Types } from 'mongoose';

// ---- Stripe fake: records calls, returns plausible objects. Webhook signing uses the real SDK. ----
const stripeState = vi.hoisted(() => ({
  refunds: [] as { id: string; amount: number; payment_intent: string; status: string; created: number; currency: string; reason: string | null }[],
  fee: 330,
}));

vi.mock('../src/config/stripe.js', () => {
  const real = new Stripe('sk_test_dummy');
  const fake = {
    webhooks: real.webhooks,
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({
        id,
        amount_received: 10_000,
        currency: 'usd',
        latest_charge: { id: `ch_${id}`, balance_transaction: { id: `txn_${id}`, fee: stripeState.fee, net: 10_000 - stripeState.fee } },
      })),
    },
    refunds: {
      create: vi.fn(async (params: { payment_intent: string; amount: number; reason?: string }) => {
        const refund = {
          id: `re_${stripeState.refunds.length + 1}`,
          amount: params.amount,
          payment_intent: params.payment_intent,
          status: 'succeeded',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          reason: params.reason ?? null,
        };
        stripeState.refunds.push(refund);
        return refund;
      }),
      list: vi.fn(async ({ payment_intent }: { payment_intent: string }) => ({
        data: stripeState.refunds.filter((r) => r.payment_intent === payment_intent),
      })),
    },
    payouts: {
      list: vi.fn(async () => ({
        data: [{ id: 'po_1', amount: 9_670, currency: 'usd', status: 'paid', arrival_date: 1_790_000_000, created: 1_789_900_000, method: 'standard', description: null }],
      })),
      retrieve: vi.fn(async (id: string) => ({ id, amount: 9_670, currency: 'usd', status: 'paid', arrival_date: 1_790_000_000 })),
    },
    balanceTransactions: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield { id: 'txn_pi_paid', type: 'charge', amount: 10_000, fee: 330, net: 9_670, created: 1_789_800_000, source: 'ch_pi_paid' };
          yield { id: 'txn_unknown', type: 'adjustment', amount: -100, fee: 0, net: -100, created: 1_789_800_100, source: 'adj_1' };
          yield { id: 'po_1', type: 'payout', amount: -9_570, fee: 0, net: -9_570, created: 1_789_900_000, source: 'po_1' };
        },
      })),
    },
  };
  return { getStripe: () => fake };
});

import Category from '../src/models/Category.js';
import EmailLog from '../src/models/EmailLog.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import StockAdjustment from '../src/models/StockAdjustment.js';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import { sha256 } from '../src/lib/crypto.js';
import { app, customerToken, PASSWORD, signedInStaff, signIn, uniqueEmail } from './helpers.js';

beforeEach(() => {
  stripeState.refunds.length = 0;
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

async function customer(name = 'Casey Customer') {
  return User.create({ name, email: uniqueEmail('cust'), password: PASSWORD });
}

/** A paid order with a Stripe payment on record (as the webhook would leave it). */
async function paidOrder(user: Types.ObjectId, opts: { total?: number; status?: 'paid' | 'shipped'; stock?: number } = {}) {
  const product = await Product.create({ name: 'Lamp', price: opts.total ?? 10_000, stock: opts.stock ?? 5, costPrice: 4_000 });
  return Order.create({
    user,
    items: [{ product: product._id, name: 'Lamp', price: product.price, costPrice: 4_000, quantity: 1 }],
    total: product.price,
    status: opts.status ?? 'paid',
    paidAt: new Date(),
    payment: { paymentIntentId: `pi_${product.id}`, chargeId: `ch_${product.id}`, amountTotal: product.price, fee: 330, net: product.price - 330 },
  });
}

// ---------------------------------------------------------------- catalogue

describe('catalogue', () => {
  it('stores the new product fields, hides drafts and cost price from the storefront', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const res = await agent
      .post('/api/admin/products')
      .send({
        name: 'Desk Lamp',
        price: 4_500,
        compareAtPrice: 5_900,
        costPrice: 1_800,
        sku: 'lamp-01',
        images: ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
        category: 'Home Office',
        stock: 12,
        featured: true,
        status: 'draft',
      })
      .expect(201);
    expect(res.body.product).toMatchObject({ sku: 'LAMP-01', image: 'https://img.example/a.jpg', category: 'home-office', stock: 12 });

    expect((await request(app).get('/api/products')).body.total).toBe(0);
    await request(app).get(`/api/products/${res.body.product._id}`).expect(404);

    await agent.put(`/api/admin/products/${res.body.product._id}`).send({ status: 'active' }).expect(200);
    const pub = await request(app).get(`/api/products/${res.body.product._id}`).expect(200);
    expect(pub.body.product).not.toHaveProperty('costPrice');
    const admin = await agent.get(`/api/admin/products/${res.body.product._id}`).expect(200);
    expect(admin.body.product.costPrice).toBe(1_800);

    // The category was created on first use, with a readable name.
    expect(await Category.findOne({ slug: 'home-office' })).toMatchObject({ name: 'Home Office' });
    await agent.post('/api/admin/products').send({ name: 'Other', price: 1, stock: 1, sku: 'LAMP-01' }).expect(409);
  });

  it('records every stock change and refuses to go negative', async () => {
    const { agent, user } = await signedInStaff({ role: 'staff' });
    const created = await agent.post('/api/admin/products').send({ name: 'Mug', price: 1_000, stock: 10 }).expect(201);
    const id = created.body.product._id;

    await agent.put(`/api/admin/products/${id}`).send({ stock: 7 }).expect(200);
    await agent.post(`/api/admin/products/${id}/stock`).send({ delta: 5, reason: 'restock', note: 'Delivery' }).expect(200);
    await agent.post(`/api/admin/products/${id}/stock`).send({ delta: -100, reason: 'damaged' }).expect(400);

    const history = await agent.get(`/api/admin/products/${id}/stock-history`).expect(200);
    expect(history.body.entries.map((e: { delta: number; reason: string; stockAfter: number }) => [e.reason, e.delta, e.stockAfter])).toEqual([
      ['restock', 5, 12],
      ['manual', -3, 7],
      ['restock', 10, 10],
    ]);
    expect(history.body.entries[0].by.name).toBe(user.name);
  });

  it('archives instead of deleting products that sold, and applies bulk actions', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const buyer = await customer();
    const sold = await paidOrder(buyer._id, { total: 2_000 });
    const soldId = sold.items[0]!.product.toString();
    const fresh = await Product.create({ name: 'Unsold', price: 1_000, stock: 1 });

    await agent.delete(`/api/admin/products/${soldId}`).expect(409);
    await agent.delete(`/api/admin/products/${fresh.id}`).expect(200);

    await agent.post('/api/admin/products/bulk').send({ action: 'price', ids: [soldId], percent: -10 }).expect(200);
    expect((await Product.findById(soldId))?.price).toBe(1_800);
    await agent.post('/api/admin/products/bulk').send({ action: 'archive', ids: [soldId] }).expect(200);
    const list = await agent.get('/api/admin/products').expect(200);
    expect(list.body.total).toBe(0);
    expect(list.body.counts.archived).toBe(1);
    await agent.post('/api/admin/products/bulk').send({ action: 'price', ids: [soldId], percent: -95 }).expect(400);
  });

  it('exports and imports CSV, validating every row before writing anything', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    await Product.create({ name: 'Mug', price: 1_000, stock: 3, sku: 'MUG-1' });

    const exported = await agent.get('/api/admin/products/export').expect(200);
    expect(exported.text.split('\r\n')[0]).toBe('sku,name,description,category,price,compare_at_price,cost_price,stock,status,featured,images');

    const csv = ['sku,name,price,stock,category', 'MUG-1,,12.50,9,', 'NEW-1,Bottle,8.00,4,kitchen'].join('\n');
    const dry = await agent.post('/api/admin/products/import?dryRun=1').attach('file', Buffer.from(csv), 'p.csv').expect(200);
    expect(dry.body).toMatchObject({ rows: 2, create: 1, update: 1, applied: false });
    expect(await Product.countDocuments()).toBe(1);

    const bad = `${csv}\n,No price,,1,`;
    const rejected = await agent.post('/api/admin/products/import').attach('file', Buffer.from(bad), 'p.csv').expect(400);
    expect(rejected.body.errors).toEqual([{ row: 4, message: 'new products need a name and a price' }]);
    expect(await Product.countDocuments()).toBe(1);

    await agent.post('/api/admin/products/import').attach('file', Buffer.from(csv), 'p.csv').expect(200);
    expect(await Product.findOne({ sku: 'MUG-1' })).toMatchObject({ price: 1_250, stock: 9, name: 'Mug' });
    expect(await Product.findOne({ sku: 'NEW-1' })).toMatchObject({ name: 'Bottle', price: 800, stock: 4, category: 'kitchen' });
    expect(await StockAdjustment.countDocuments({ reason: 'import' })).toBe(2);
  });

  it('manages categories: rename carries products, delete needs somewhere to move them', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    await Product.create({ name: 'Hoodie', price: 4_000, stock: 1, category: 'clothing' });
    const list = await agent.get('/api/admin/categories').expect(200);
    expect(list.body.categories).toMatchObject([{ slug: 'clothing', name: 'Clothing', productCount: 1 }]);
    const id = list.body.categories[0]._id;

    await agent.put(`/api/admin/categories/${id}`).send({ name: 'Apparel', slug: 'apparel' }).expect(200);
    expect(await Product.findOne({ name: 'Hoodie' })).toMatchObject({ category: 'apparel' });

    const other = await agent.post('/api/admin/categories').send({ name: 'Sale' }).expect(201);
    await agent.delete(`/api/admin/categories/${id}`).expect(409);
    await agent.delete(`/api/admin/categories/${id}?moveTo=sale`).expect(204);
    expect(await Product.findOne({ name: 'Hoodie' })).toMatchObject({ category: 'sale' });
    expect(other.body.category.slug).toBe('sale');

    const pub = await request(app).get('/api/products/categories').expect(200);
    expect(pub.body).toEqual({ categories: ['sale'], items: [{ slug: 'sale', name: 'Sale', image: '' }] });
  });

  it('accepts real images only, and serves them cross-origin', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const up = await agent.post('/api/admin/uploads/images').attach('file', PNG, 'photo.png').expect(201);
    expect(up.body.url).toMatch(/\/uploads\/[\w-]+\.png$/);

    const file = await request(app).get(new URL(up.body.url).pathname).expect(200);
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(file.headers['content-type']).toBe('image/png');

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await agent.post('/api/admin/uploads/images').attach('file', svg, 'x.png').expect(400);
    await agent.post('/api/admin/uploads/images').attach('file', Buffer.from('hello world, not an image'), 'x.jpg').expect(400);
  });
});

// ---------------------------------------------------------------- settings

describe('settings', () => {
  it('lets admins edit store settings, locks the currency once there are orders', async () => {
    const { agent: staff } = await signedInStaff({ role: 'staff' });
    await staff.patch('/api/admin/settings').send({ storeName: 'Nope' }).expect(403);

    const { agent } = await signedInStaff({ role: 'admin' });
    await agent.patch('/api/admin/settings').send({ storeName: 'Kosmik Goods', currency: 'gbp', shippingCountries: ['gh', 'GB', 'GB'], lowStockThreshold: 2 }).expect(200);
    const pub = await request(app).get('/api/settings').expect(200);
    expect(pub.body).toEqual({ storeName: 'Kosmik Goods', currency: 'gbp', supportEmail: '' });
    expect((await agent.get('/api/admin/settings')).body.settings.shippingCountries).toEqual(['GH', 'GB']);

    await agent.patch('/api/admin/settings').send({ shippingCountries: ['GHANA'] }).expect(400);
    await paidOrder((await customer())._id);
    await agent.patch('/api/admin/settings').send({ currency: 'eur' }).expect(409);
  });

  it('uses the configured low-stock threshold', async () => {
    const { agent } = await signedInStaff();
    await Product.create({ name: 'A', price: 1, stock: 4 });
    expect((await agent.get('/api/admin/notifications')).body.lowStockCount).toBe(1);
    await agent.patch('/api/admin/settings').send({ lowStockThreshold: 2 }).expect(200);
    expect((await agent.get('/api/admin/notifications')).body.lowStockCount).toBe(0);
  });
});

// ---------------------------------------------------------------- orders

describe('orders', () => {
  it('moves through processing, shipped (with tracking + email) and delivered', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const buyer = await customer('Ann Archer');
    const order = await paidOrder(buyer._id);

    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'processing' }).expect(200);
    const shipped = await agent
      .patch(`/api/admin/orders/${order.id}/status`)
      .send({ status: 'shipped', carrier: 'DHL', trackingNumber: 'JD0001', trackingUrl: 'https://track.example/JD0001' })
      .expect(200);
    expect(shipped.body.order.fulfillment).toMatchObject({ carrier: 'DHL', trackingNumber: 'JD0001' });
    expect(shipped.body.allowedTransitions).toEqual(['delivered']);
    expect(await EmailLog.findOne({ template: 'order_shipped', to: buyer.email })).toMatchObject({ status: 'logged' });

    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'delivered' }).expect(200);
    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled' }).expect(400);
    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'shipped', trackingUrl: 'javascript:alert(1)' }).expect(400);
  });

  it('keeps internal notes, which only their author or an admin can delete', async () => {
    const { agent: staff } = await signedInStaff({ role: 'staff' });
    const { agent: other } = await signedInStaff({ role: 'staff' });
    const order = await paidOrder((await customer())._id);
    const added = await staff.post(`/api/admin/orders/${order.id}/notes`).send({ body: 'Gift wrap please' }).expect(201);
    const noteId = added.body.order.notes[0]._id;
    expect(added.body.order.notes[0].author.name).toBeTruthy();

    await other.delete(`/api/admin/orders/${order.id}/notes/${noteId}`).expect(403);
    await staff.delete(`/api/admin/orders/${order.id}/notes/${noteId}`).expect(200);
    const customerView = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${await customerToken()}`);
    expect(customerView.status).toBe(404); // and notes never appear on the storefront API
  });

  it('filters by date and amount', async () => {
    const { agent } = await signedInStaff();
    const buyer = await customer();
    const cheap = await paidOrder(buyer._id, { total: 1_000 });
    await paidOrder(buyer._id, { total: 50_000 });
    await Order.collection.updateOne({ _id: cheap._id }, { $set: { createdAt: new Date('2025-01-01') } });

    expect((await agent.get('/api/admin/orders?max=5000')).body.total).toBe(1);
    expect((await agent.get('/api/admin/orders?min=20000')).body.total).toBe(1);
    expect((await agent.get('/api/admin/orders?from=2026-01-01')).body.total).toBe(1);
  });
});

// ---------------------------------------------------------------- finance

describe('payments and refunds', () => {
  const stripe = new Stripe('sk_test_dummy');
  const send = (event: object) => {
    const payload = JSON.stringify(event);
    return request(app)
      .post('/api/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! }))
      .send(payload);
  };

  it('records the payment and Stripe fee in the ledger, once, and logs the stock sale', async () => {
    const buyer = await customer();
    const product = await Product.create({ name: 'Lamp', price: 10_000, stock: 4 });
    const order = await Order.create({ user: buyer._id, items: [{ product: product._id, name: 'Lamp', price: 10_000, quantity: 1 }], total: 10_000 });
    const event = {
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_paid',
          amount_subtotal: 10_000,
          amount_total: 10_000,
          total_details: { amount_tax: 0, amount_shipping: 0 },
          metadata: { orderId: order.id },
        },
      },
    };
    await send(event).expect(200);
    await send(event).expect(200);

    const paid = await Order.findById(order.id);
    expect(paid?.payment).toMatchObject({ paymentIntentId: 'pi_paid', chargeId: 'ch_pi_paid', fee: 330, net: 9_670 });
    expect(await Transaction.find()).toMatchObject([{ type: 'payment', amount: 10_000, fee: 330, net: 9_670 }]);
    expect(await StockAdjustment.find()).toMatchObject([{ reason: 'sale', delta: -1, stockAfter: 3 }]);
  });

  it('refunds partially, then fully with restock, never beyond the total', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    const order = await paidOrder((await customer())._id, { total: 10_000, stock: 5 });

    const partial = await agent.post(`/api/admin/orders/${order.id}/refunds`).send({ amount: 2_500, note: 'Scratched' }).expect(201);
    expect(partial.body.order).toMatchObject({ status: 'paid', amountRefunded: 2_500 });
    expect(partial.body.refundable).toBe(7_500);

    await agent.post(`/api/admin/orders/${order.id}/refunds`).send({ amount: 9_000 }).expect(400);
    await agent.post(`/api/admin/orders/${order.id}/refunds`).send({ amount: 1_000, restock: true }).expect(400);

    const full = await agent.post(`/api/admin/orders/${order.id}/refunds`).send({ amount: 7_500, restock: true }).expect(201);
    expect(full.body.order).toMatchObject({ status: 'refunded', amountRefunded: 10_000 });
    expect((await Product.findById(order.items[0]!.product))?.stock).toBe(6);
    expect(await Transaction.find({ type: 'refund' }).sort({ amount: 1 })).toMatchObject([{ amount: -7_500 }, { amount: -2_500 }]);
  });

  it('cancels a paid order with a refund, and refuses refunds it can’t make', async () => {
    const { agent } = await signedInStaff({ role: 'owner' });
    const order = await paidOrder((await customer())._id);
    const res = await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled', refund: true, restock: true }).expect(200);
    expect(res.body.order).toMatchObject({ status: 'cancelled', amountRefunded: 10_000 });

    const { agent: staff } = await signedInStaff({ role: 'staff' });
    const another = await paidOrder((await customer())._id);
    await staff.post(`/api/admin/orders/${another.id}/refunds`).send({ amount: 100 }).expect(403);

    await Order.updateOne({ _id: another._id }, { $unset: { payment: 1 } });
    const noStripe = await agent.post(`/api/admin/orders/${another.id}/refunds`).send({ amount: 100 }).expect(400);
    expect(noStripe.body.message).toMatch(/Stripe dashboard/);
  });

  it('picks up refunds made in the Stripe dashboard', async () => {
    const order = await paidOrder((await customer())._id);
    stripeState.refunds.push({ id: 're_dash', amount: 4_000, payment_intent: order.payment!.paymentIntentId!, status: 'succeeded', created: 1_790_000_000, currency: 'usd', reason: null });
    const event = { id: 'evt_r', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_x', object: 'charge', payment_intent: order.payment!.paymentIntentId } } };
    await send(event).expect(200);
    await send(event).expect(200);
    expect(await Order.findById(order.id)).toMatchObject({ amountRefunded: 4_000 });
    expect(await Transaction.countDocuments({ stripeId: 're_dash' })).toBe(1);
  });

  it('summarises the ledger and reconciles payouts', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    const buyer = await customer();
    const order = await paidOrder(buyer._id);
    await Transaction.create([
      { type: 'payment', order: order._id, stripeId: 'pi_paid', chargeId: 'ch_pi_paid', balanceTransactionId: 'txn_pi_paid', currency: 'usd', amount: 10_000, fee: 330, net: 9_670, occurredAt: new Date() },
      { type: 'refund', order: order._id, stripeId: 're_1', currency: 'usd', amount: -2_000, fee: 0, net: -2_000, occurredAt: new Date() },
    ]);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const summary = await agent.get(`/api/admin/finance/summary?from=${from}&unit=hour&tz=UTC`).expect(200);
    expect(summary.body.kpis).toMatchObject({ gross: { value: 10_000 }, fees: { value: 330 }, refunds: { value: 2_000 }, net: { value: 7_670 } });
    expect(summary.body.refundRate).toBe(20);
    expect(summary.body.margin).toMatchObject({ grossProfit: 6_000, marginPercent: 60, coveragePercent: 100 });

    const ledger = await agent.get('/api/admin/finance/transactions?type=refund').expect(200);
    expect(ledger.body.total).toBe(1);

    const payouts = await agent.get('/api/admin/finance/payouts').expect(200);
    expect(payouts.body.payouts[0]).toMatchObject({ id: 'po_1', amount: 9_670 });
    const recon = await agent.get('/api/admin/finance/payouts/po_1').expect(200);
    expect(recon.body).toMatchObject({ matched: 1, unmatched: 1 });
    expect(recon.body.transactions[0]).toMatchObject({ matched: true, orderId: order.id });

    const { agent: staff } = await signedInStaff({ role: 'staff' });
    await staff.get('/api/admin/finance/transactions').expect(403);
  });
});

// ---------------------------------------------------------------- customers, team, audit, search

describe('customers', () => {
  it('lets customers reset a forgotten password with a one-time link', async () => {
    const email = uniqueEmail();
    const oldToken = await customerToken(email);
    const res = await request(app).post('/api/auth/forgot').send({ email }).expect(200);
    const unknown = await request(app).post('/api/auth/forgot').send({ email: uniqueEmail() }).expect(200);
    expect(unknown.body.message).toBe(res.body.message);
    expect(await EmailLog.countDocuments({ template: 'password_reset' })).toBe(1);

    // The real token only exists in the email; plant a known one to follow the link.
    const token = 'x'.repeat(43);
    await User.updateOne({ email }, { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60_000) });
    await request(app).post('/api/auth/reset').send({ token, password: 'short' }).expect(400);
    await request(app).post('/api/auth/reset').send({ token, password: 'a-new-password' }).expect(200);
    await request(app).post('/api/auth/reset').send({ token, password: 'a-new-password' }).expect(400); // used up
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(401); // signed out
    await request(app).post('/api/auth/login').send({ email, password: 'a-new-password' }).expect(200);
  });

  it('lets admins send a reset, keep notes, and see the activity trail', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    const buyer = await customer('Kofi Mensah');
    await paidOrder(buyer._id);

    const reset = await agent.post(`/api/admin/customers/${buyer.id}/password-reset`).expect(200);
    expect(reset.body).toEqual({ email: 'logged' }); // the link itself is never returned
    await agent.post(`/api/admin/customers/${buyer.id}/notes`).send({ body: 'Prefers phone calls' }).expect(201);
    expect((await agent.get(`/api/admin/customers/${buyer.id}/notes`)).body.notes).toHaveLength(1);

    const activity = await agent.get(`/api/admin/customers/${buyer.id}/activity`).expect(200);
    const titles = activity.body.events.map((e: { title: string }) => e.title);
    expect(titles).toEqual(expect.arrayContaining(['Created an account', 'Placed an order', 'Password reset email sent', 'Note added']));
    expect(titles.some((t: string) => t.startsWith('Email: Reset your'))).toBe(true);

    const { agent: staff } = await signedInStaff({ role: 'staff' });
    await staff.post(`/api/admin/customers/${buyer.id}/password-reset`).expect(403);
  });
});

describe('team sessions, audit log and search', () => {
  it('lets an owner see and end a staff member’s sessions', async () => {
    const { agent: owner } = await signedInStaff({ role: 'owner' });
    const { user: staff, agent: staffAgent, secret } = await signedInStaff({ role: 'staff' });
    await signIn(staff.email, secret, 1);

    const sessions = await owner.get(`/api/admin/team/${staff.id}/sessions`).expect(200);
    expect(sessions.body.sessions).toHaveLength(2);
    await owner.delete(`/api/admin/team/${staff.id}/sessions`).expect(200);
    await staffAgent.get('/api/admin/auth/me').expect(401);

    const { agent: admin } = await signedInStaff({ role: 'admin' });
    const ownerId = (await User.findOne({ role: 'owner' }))!.id;
    await admin.get(`/api/admin/team/${ownerId}/sessions`).expect(403);
  });

  it('filters the audit log by action prefix and exports it', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    await agent.post('/api/admin/products').send({ name: 'A', price: 1, stock: 1 }).expect(201);
    await agent.patch('/api/admin/settings').send({ storeName: 'X' }).expect(200);

    const products = await agent.get('/api/admin/audit?action=product.').expect(200);
    expect(products.body.entries.map((e: { action: string }) => e.action)).toEqual(['product.create']);
    expect(products.body.actions).toEqual(expect.arrayContaining(['auth.login', 'product.create', 'settings.update']));
    const csv = await agent.get('/api/admin/audit/export?action=settings.update').expect(200);
    expect(csv.text).toContain('settings.update');
  });

  it('searches orders, products and customers', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const buyer = await customer('Zara Mensah');
    const order = await paidOrder(buyer._id);
    await Product.updateOne({ _id: order.items[0]!.product }, { sku: 'ZED-9' });

    const res = await agent.get('/api/admin/search?q=zara').expect(200);
    expect(res.body.customers.map((c: { name: string }) => c.name)).toEqual(['Zara Mensah']);
    expect(res.body.orders).toHaveLength(1);
    expect((await agent.get('/api/admin/search?q=zed-9')).body.products).toHaveLength(1);
    expect((await agent.get('/api/admin/search?q=z')).body.products).toHaveLength(0);
  });
});

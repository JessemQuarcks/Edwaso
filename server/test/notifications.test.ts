import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';

// ---- Stripe fake. `failRetrieve` makes the payment lookup throw, to simulate a webhook failure. ----
const stripeState = vi.hoisted(() => ({
  failRetrieve: false,
  refunds: [] as { id: string; amount: number; payment_intent: string; status: string; created: number; currency: string; reason: string | null }[],
}));

vi.mock('../src/config/stripe.js', () => {
  const real = new Stripe('sk_test_dummy');
  const fake = {
    webhooks: real.webhooks,
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => {
        if (stripeState.failRetrieve) throw new Error('Stripe API unavailable');
        return {
          id,
          amount_received: 5_000,
          currency: 'usd',
          latest_charge: { id: `ch_${id}`, balance_transaction: { id: `txn_${id}`, fee: 175, net: 4_825 } },
        };
      }),
    },
    refunds: {
      create: vi.fn(async (params: { payment_intent: string; amount: number }) => {
        const refund = {
          id: `re_${stripeState.refunds.length + 1}`,
          amount: params.amount,
          payment_intent: params.payment_intent,
          status: 'succeeded',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          reason: null,
        };
        stripeState.refunds.push(refund);
        return refund;
      }),
      list: vi.fn(async ({ payment_intent }: { payment_intent: string }) => ({
        data: stripeState.refunds.filter((r) => r.payment_intent === payment_intent),
      })),
    },
  };
  return { getStripe: () => fake };
});

import EmailLog from '../src/models/EmailLog.js';
import Notification from '../src/models/Notification.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';
import { adjustStock } from '../src/lib/inventory.js';
import { renderEmail } from '../src/lib/email-template.js';
import { app, PASSWORD, signedInStaff, uniqueEmail } from './helpers.js';

beforeEach(() => {
  stripeState.failRetrieve = false;
  stripeState.refunds.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

const stripe = new Stripe('sk_test_dummy');
const sendWebhook = (event: object) => {
  const payload = JSON.stringify(event);
  return request(app)
    .post('/api/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! }))
    .send(payload);
};

async function pendingOrder(opts: { stock?: number } = {}) {
  const buyer = await User.create({ name: 'Ama Mensah', email: uniqueEmail('buyer'), password: PASSWORD });
  const product = await Product.create({ name: 'Canvas Tote', price: 2_500, stock: opts.stock ?? 20 });
  const order = await Order.create({
    user: buyer._id,
    items: [{ product: product._id, name: 'Canvas Tote', price: 2_500, quantity: 2 }],
    total: 5_000,
  });
  return { buyer, product, order };
}

const paidEvent = (orderId: string, eventId = 'evt_paid') => ({
  id: eventId,
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: `pi_${orderId}`,
      amount_subtotal: 5_000,
      amount_total: 5_000,
      total_details: { amount_tax: 0, amount_shipping: 0 },
      shipping_details: { name: 'Ama Mensah', address: { line1: '12 Oxford St', city: 'Accra', country: 'GH', postal_code: null, line2: null, state: null } },
      metadata: { orderId },
    },
  },
});

// ---------------------------------------------------------------- templates

describe('email template', () => {
  it('escapes content, keeps html and text in step, and refuses non-web links as buttons', () => {
    const { html, text } = renderEmail({
      storeName: 'Shop <b>',
      heading: 'Hi "there"',
      blocks: [
        { type: 'text', text: '<script>alert(1)</script>' },
        { type: 'button', label: 'Open', url: 'javascript:alert(1)' },
        { type: 'items', items: [{ name: 'Mug & Co', quantity: 2, amount: '$10.00' }], totals: [{ label: 'Total', amount: '$10.00', strong: true }] },
      ],
      footer: ['Footer'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Shop &lt;b&gt;');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('Mug &amp; Co');
    expect(text).toContain('2 × Mug & Co  $10.00');
    expect(text).toContain('Total: $10.00');
  });
});

// ---------------------------------------------------------------- orders

describe('paid orders', () => {
  it('emails one confirmation and raises one notification, however often Stripe redelivers', async () => {
    const { buyer, order } = await pendingOrder();
    await sendWebhook(paidEvent(order.id)).expect(200);
    await sendWebhook(paidEvent(order.id)).expect(200);

    const emails = await EmailLog.find({ order: order._id });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ template: 'order_confirmation', to: buyer.email, status: 'logged' });
    expect(await Notification.find({ type: 'order_paid' })).toHaveLength(1);
  });

  it('shows the event in each person’s feed with their own read state', async () => {
    const { order } = await pendingOrder();
    const owner = await signedInStaff({ role: 'owner' });
    const staff = await signedInStaff({ role: 'staff' });
    await sendWebhook(paidEvent(order.id)).expect(200);

    const feed = await owner.agent.get('/api/admin/notifications').expect(200);
    expect(feed.body.unread).toBe(1);
    expect(feed.body.feed[0]).toMatchObject({ type: 'order_paid', read: false, link: `/admin/orders/${order.id}` });
    expect(feed.body.feed[0].title).toContain('$50.00');
    expect(feed.body.feed[0]).not.toHaveProperty('readBy');

    await owner.agent.post('/api/admin/notifications/read').send({}).expect(204);
    expect((await owner.agent.get('/api/admin/notifications')).body).toMatchObject({ unread: 0, feed: [{ read: true }] });
    expect((await staff.agent.get('/api/admin/notifications')).body.unread).toBe(1);
  });

  it('emails staff who opted in to new orders, and nobody else', async () => {
    const { order } = await pendingOrder();
    const owner = await signedInStaff({ role: 'owner' });
    const admin = await signedInStaff({ role: 'admin' });
    await admin.agent.put('/api/admin/notifications/preferences').send({ orders: true }).expect(200);

    await sendWebhook(paidEvent(order.id)).expect(200);
    const alerts = await EmailLog.find({ template: 'alert_order_paid' });
    expect(alerts.map((e) => e.to)).toEqual([admin.user.email]);
    expect(alerts.map((e) => e.to)).not.toContain(owner.user.email);
  });
});

// ---------------------------------------------------------------- stock

describe('stock alerts', () => {
  it('alerts once when a product crosses into low stock, and again when it sells out', async () => {
    const { user: owner } = await signedInStaff({ role: 'owner' });
    const product = await Product.create({ name: 'Desk Lamp', price: 4_000, stock: 7 });

    await adjustStock({ product: product._id, delta: -1, reason: 'sale' }); // 6: above the threshold (5)
    expect(await Notification.countDocuments()).toBe(0);
    await adjustStock({ product: product._id, delta: -1, reason: 'sale' }); // 5: crosses
    await adjustStock({ product: product._id, delta: -2, reason: 'sale' }); // 3: already low
    expect(await Notification.find()).toMatchObject([{ type: 'low_stock', title: 'Desk Lamp is running low' }]);

    await adjustStock({ product: product._id, delta: -10, reason: 'sale' }); // clamps at 0
    expect((await Notification.find().sort({ createdAt: 1 })).map((n) => n.type)).toEqual(['low_stock', 'out_of_stock']);
    // Owners get stock emails by default.
    expect(await EmailLog.countDocuments({ to: owner.email, template: /^alert_/ })).toBe(2);
  });

  it('does not alert on restocks', async () => {
    const product = await Product.create({ name: 'Mug', price: 1_000, stock: 0 });
    await adjustStock({ product: product._id, delta: 3, reason: 'restock' });
    expect(await Notification.countDocuments()).toBe(0);
  });
});

// ---------------------------------------------------------------- webhooks

describe('failed webhooks', () => {
  it('notifies owners and admins once per event, and marks it resolved when a retry succeeds', async () => {
    const { buyer, order } = await pendingOrder();
    const owner = await signedInStaff({ role: 'owner' });
    const staff = await signedInStaff({ role: 'staff' });

    stripeState.failRetrieve = true;
    await sendWebhook(paidEvent(order.id, 'evt_retry')).expect(500);
    await sendWebhook(paidEvent(order.id, 'evt_retry')).expect(500);
    const failures = await Notification.find({ type: 'webhook_failed' });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.body).toContain('Stripe API unavailable');
    expect(await EmailLog.countDocuments({ to: owner.user.email, template: 'alert_webhook_failed' })).toBe(1);

    // Staff don't see payment problems.
    const staffFeed = (await staff.agent.get('/api/admin/notifications')).body.feed as { type: string }[];
    expect(staffFeed.map((n) => n.type)).not.toContain('webhook_failed');

    stripeState.failRetrieve = false;
    await sendWebhook(paidEvent(order.id, 'evt_retry')).expect(200);
    expect((await Notification.findOne({ type: 'webhook_failed' }))?.resolvedAt).toBeInstanceOf(Date);
    // The customer still gets their confirmation after the retry.
    expect(await EmailLog.countDocuments({ to: buyer.email, template: 'order_confirmation' })).toBe(1);
  });
});

// ---------------------------------------------------------------- refunds & cancellation

describe('customer emails for refunds and cancellations', () => {
  async function paid() {
    const { buyer, order } = await pendingOrder();
    await sendWebhook(paidEvent(order.id)).expect(200);
    return { buyer, order };
  }

  it('sends a refund email for a refund', async () => {
    const { buyer, order } = await paid();
    const { agent } = await signedInStaff({ role: 'owner' });
    await agent.post(`/api/admin/orders/${order.id}/refunds`).send({ amount: 2_000, reason: 'requested_by_customer' }).expect(201);
    expect(await EmailLog.find({ to: buyer.email, template: 'refund_issued' })).toHaveLength(1);
  });

  it('sends one cancellation email, not a separate refund email, when a paid order is cancelled and refunded', async () => {
    const { buyer, order } = await paid();
    const { agent } = await signedInStaff({ role: 'owner' });
    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled', refund: true, restock: true }).expect(200);
    const templates = (await EmailLog.find({ to: buyer.email })).map((e) => e.template).sort();
    expect(templates).toEqual(['order_cancelled', 'order_confirmation']);
  });

  it('can cancel without emailing the customer', async () => {
    const { buyer, order } = await paid();
    const { agent } = await signedInStaff({ role: 'owner' });
    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled', notify: false }).expect(200);
    expect(await EmailLog.countDocuments({ to: buyer.email, template: 'order_cancelled' })).toBe(0);
  });
});

// ---------------------------------------------------------------- invites

describe('invite emails', () => {
  it('emails the invite link and does not return it when the email was sent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { agent } = await signedInStaff({ role: 'owner' });
    const email = uniqueEmail('invitee');

    const res = await agent.post('/api/admin/invites').send({ email, role: 'staff' }).expect(201);
    expect(res.body).toMatchObject({ emailed: true });
    expect(res.body).not.toHaveProperty('inviteUrl');
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { to: string[]; html: string };
    expect(sent.to).toEqual([email]);
    expect(sent.html).toContain('/admin/invite/');
  });

  it('falls back to showing the link once when email is not set up', async () => {
    const { agent } = await signedInStaff({ role: 'owner' });
    const res = await agent.post('/api/admin/invites').send({ email: uniqueEmail('invitee'), role: 'staff' }).expect(201);
    expect(res.body).toMatchObject({ emailed: false });
    expect(res.body.inviteUrl).toContain('/admin/invite/');
  });
});

// ---------------------------------------------------------------- preferences & test email

describe('email preferences', () => {
  it('uses role defaults, saves choices, and never lets staff opt in to payment alerts', async () => {
    const owner = await signedInStaff({ role: 'owner' });
    expect((await owner.agent.get('/api/admin/notifications/preferences')).body).toMatchObject({
      topics: ['orders', 'stock', 'payments'],
      preferences: { orders: false, stock: true, payments: true },
    });

    const staff = await signedInStaff({ role: 'staff' });
    const res = await staff.agent.put('/api/admin/notifications/preferences').send({ orders: true, payments: true }).expect(200);
    expect(res.body).toMatchObject({ topics: ['orders', 'stock'], preferences: { orders: true, stock: false, payments: false } });
    expect((await User.findById(staff.user._id))?.notify).toMatchObject({ orders: true, stock: false });
  });

  it('sends a test email to owners and admins only', async () => {
    const owner = await signedInStaff({ role: 'owner' });
    const res = await owner.agent.post('/api/admin/settings/test-email').expect(200);
    expect(res.body).toMatchObject({ status: 'logged', to: owner.user.email });
    expect((await owner.agent.get('/api/admin/settings')).body.email).toMatchObject({ configured: false });

    const staff = await signedInStaff({ role: 'staff' });
    await staff.agent.post('/api/admin/settings/test-email').expect(403);
  });
});

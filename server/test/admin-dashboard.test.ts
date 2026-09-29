import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Types } from 'mongoose';
import Order, { type OrderStatus } from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';
import { app, customerToken, PASSWORD, signedInStaff, uniqueEmail } from './helpers.js';

async function customer(name = 'Casey Customer', createdAt?: Date) {
  const user = await User.create({ name, email: uniqueEmail('cust'), password: PASSWORD });
  if (createdAt) await User.collection.updateOne({ _id: user._id }, { $set: { createdAt } });
  return user;
}

async function order(
  user: Types.ObjectId,
  product: { _id: Types.ObjectId; name: string; price: number },
  opts: { status?: OrderStatus; quantity?: number; paidAt?: Date; createdAt?: Date } = {}
) {
  const { status = 'paid', quantity = 1 } = opts;
  const createdAt = opts.createdAt ?? opts.paidAt ?? new Date();
  const doc = await Order.create({
    user,
    items: [{ product: product._id, name: product.name, price: product.price, quantity }],
    total: product.price * quantity,
    status,
    // A cancelled order only has a payment date if it was paid before being cancelled.
    paidAt: opts.paidAt ?? (status === 'paid' || status === 'shipped' ? createdAt : undefined),
  });
  await Order.collection.updateOne({ _id: doc._id }, { $set: { createdAt } });
  return doc;
}

describe('overview stats', () => {
  const from = new Date('2026-03-01T00:00:00Z');
  const to = new Date('2026-03-08T00:00:00Z');
  const query = `from=${from.toISOString()}&to=${to.toISOString()}&unit=day&tz=UTC`;

  it('totals revenue, compares with the previous period and fills every bucket', async () => {
    const { agent } = await signedInStaff();
    const buyer = await customer('Buyer', new Date('2026-03-02T00:00:00Z'));
    const mug = await Product.create({ name: 'Mug', price: 1000, stock: 3 });
    const lamp = await Product.create({ name: 'Lamp', price: 5000, stock: 50 });

    await order(buyer._id, mug, { quantity: 3, paidAt: new Date('2026-03-02T10:00:00Z') });
    await order(buyer._id, lamp, { status: 'shipped', paidAt: new Date('2026-03-05T10:00:00Z') });
    await order(buyer._id, lamp, { paidAt: new Date('2026-02-25T10:00:00Z') }); // previous period
    await order(buyer._id, lamp, { status: 'pending', createdAt: new Date('2026-03-03T10:00:00Z') }); // not a sale
    await order(buyer._id, mug, { status: 'cancelled', paidAt: new Date('2026-03-04T10:00:00Z') });
    await order(buyer._id, mug, { status: 'cancelled', createdAt: new Date('2026-03-04T11:00:00Z') }); // expired checkout

    const res = await agent.get(`/api/admin/stats/overview?${query}`).expect(200);
    const { kpis, series, topProducts, lowStock } = res.body;

    expect(kpis.revenue).toEqual({ value: 8000, previous: 5000, change: 60 });
    expect(kpis.completedOrders.value).toBe(2);
    expect(kpis.averageOrderValue.value).toBe(4000);
    expect(kpis.cancelledOrders.value).toBe(1);
    expect(kpis.newCustomers.value).toBe(1);
    // Both products were created today, outside the March range.
    expect(kpis.products).toEqual({ value: 2, added: 0 });

    expect(series).toHaveLength(7);
    expect(series.map((p: { key: string }) => p.key)[0]).toBe('2026-03-01');
    expect(series.find((p: { key: string }) => p.key === '2026-03-02')).toMatchObject({ revenue: 3000, orders: 1 });
    // The previous week's order sits in the matching position (Feb 25 = 3rd day of Feb 22-28).
    expect(series[3].previousRevenue).toBe(5000);

    expect(topProducts[0]).toMatchObject({ name: 'Mug', units: 3, revenue: 3000 });
    expect(lowStock.map((p: { name: string }) => p.name)).toEqual(['Mug']);
  });

  it('buckets in the admin’s timezone', async () => {
    const { agent } = await signedInStaff();
    const buyer = await customer();
    const mug = await Product.create({ name: 'Mug', price: 1000, stock: 10 });
    // 03:30 UTC on the 3rd is still the 2nd in New York.
    await order(buyer._id, mug, { paidAt: new Date('2026-03-03T03:30:00Z') });

    const ny = await agent.get(`/api/admin/stats/overview?${query.replace('tz=UTC', 'tz=America/New_York')}`).expect(200);
    expect(ny.body.series.find((p: { revenue: number }) => p.revenue > 0).key).toBe('2026-03-02');
    const utc = await agent.get(`/api/admin/stats/overview?${query}`).expect(200);
    expect(utc.body.series.find((p: { revenue: number }) => p.revenue > 0).key).toBe('2026-03-03');
  });

  it('supports all-time ranges without a comparison and rejects bad ones', async () => {
    const { agent } = await signedInStaff();
    const res = await agent.get('/api/admin/stats/overview?unit=month&tz=UTC').expect(200);
    expect(res.body.range.previous).toBeNull();
    expect(res.body.kpis.revenue.change).toBeNull();

    await agent.get(`/api/admin/stats/overview?from=${to.toISOString()}&to=${from.toISOString()}`).expect(400);
    await agent.get(`/api/admin/stats/overview?from=2020-01-01&to=2026-01-01&unit=hour`).expect(400);
    await agent.get(`/api/admin/stats/overview?${query}&tz=Not/AZone`).expect(400);
  });

  it('breaks revenue down by category for analytics', async () => {
    const { agent } = await signedInStaff();
    const buyer = await customer();
    const hoodie = await Product.create({ name: 'Hoodie', price: 4000, stock: 10, category: 'clothing' });
    const cable = await Product.create({ name: 'Cable', price: 1000, stock: 10, category: 'electronics' });
    await order(buyer._id, hoodie, { quantity: 2, paidAt: new Date('2026-03-02T10:00:00Z') });
    await order(buyer._id, cable, { paidAt: new Date('2026-03-03T10:00:00Z') });

    const res = await agent.get(`/api/admin/stats/analytics?${query}`).expect(200);
    expect(res.body.byCategory).toEqual([
      { category: 'clothing', revenue: 8000, units: 2 },
      { category: 'electronics', revenue: 1000, units: 1 },
    ]);
    expect(res.body.summary.unitsSold.value).toBe(3);
    expect(res.body.topCustomers[0]).toMatchObject({ orders: 2, spent: 9000 });
  });
});

describe('orders console', () => {
  it('filters by status and search, with counts for the tabs', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const ann = await customer('Ann Archer');
    const bob = await customer('Bob Baker');
    const mug = await Product.create({ name: 'Mug', price: 1000, stock: 10 });
    const shipped = await order(ann._id, mug, { status: 'shipped' });
    await order(ann._id, mug);
    await order(bob._id, mug);

    const all = await agent.get('/api/admin/orders').expect(200);
    expect(all.body.counts).toMatchObject({ all: 3, paid: 2, shipped: 1, pending: 0 });

    const ann2 = await agent.get('/api/admin/orders?q=archer').expect(200);
    expect(ann2.body.total).toBe(2);
    expect(ann2.body.counts).toMatchObject({ all: 2, paid: 1, shipped: 1 });

    const byId = await agent.get(`/api/admin/orders?q=%23${shipped.id.slice(-8)}`).expect(200);
    expect(byId.body.orders.map((o: { _id: string }) => o._id)).toEqual([shipped.id]);

    const paid = await agent.get('/api/admin/orders?status=paid&limit=1').expect(200);
    expect(paid.body).toMatchObject({ total: 2, pages: 2 });
  });

  it('exports CSV with spreadsheet formulas neutralised', async () => {
    const { agent } = await signedInStaff();
    const evil = await customer('=HYPERLINK("http://evil.example","click")');
    const mug = await Product.create({ name: 'Mug', price: 1234, stock: 10 });
    await order(evil._id, mug);

    const res = await agent.get('/api/admin/orders/export').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(res.text).toContain('12.34');
  });

  it('enforces status transitions, records who changed what, and can restock', async () => {
    const { agent, user: admin } = await signedInStaff({ role: 'staff' });
    const buyer = await customer();
    const mug = await Product.create({ name: 'Mug', price: 1000, stock: 5 });
    const pending = await order(buyer._id, mug, { status: 'pending' });
    const paid = await order(buyer._id, mug, { quantity: 2 });

    const noPay = await agent.patch(`/api/admin/orders/${pending.id}/status`).send({ status: 'paid' }).expect(400);
    expect(noPay.body.message).toMatch(/can.t be marked paid/);

    const cancelled = await agent
      .patch(`/api/admin/orders/${paid.id}/status`)
      .send({ status: 'cancelled', restock: true, note: 'Customer changed their mind' })
      .expect(200);
    expect(cancelled.body.allowedTransitions).toEqual([]);
    expect(cancelled.body.order.statusHistory.at(-1)).toMatchObject({
      status: 'cancelled',
      note: 'Customer changed their mind',
      by: { email: admin.email },
    });
    expect((await Product.findById(mug._id))?.stock).toBe(7);

    await agent.patch(`/api/admin/orders/${paid.id}/status`).send({ status: 'shipped' }).expect(400);
  });
});

describe('products console', () => {
  it('searches partial names, filters by stock and reports units sold', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const buyer = await customer();
    const hoodie = await Product.create({ name: 'Cotton Hoodie', price: 4000, stock: 2 });
    await Product.create({ name: 'Canvas Bag', price: 2000, stock: 0 });
    await Product.create({ name: 'Water Bottle', price: 1000, stock: 40 });
    await order(buyer._id, hoodie, { quantity: 3 });
    await order(buyer._id, hoodie, { status: 'pending' });

    const search = await agent.get('/api/admin/products?q=hood').expect(200);
    expect(search.body.products).toHaveLength(1);
    expect(search.body.products[0]).toMatchObject({ name: 'Cotton Hoodie', sold: 3 });
    expect(search.body.counts).toEqual({ all: 3, low: 1, out: 1 });

    const out = await agent.get('/api/admin/products?stock=out').expect(200);
    expect(out.body.products.map((p: { name: string }) => p.name)).toEqual(['Canvas Bag']);
  });
});

describe('customers console', () => {
  it('lists customers with lifetime value, excluding staff', async () => {
    const { agent } = await signedInStaff();
    const big = await customer('Big Spender');
    await customer('Window Shopper');
    const lamp = await Product.create({ name: 'Lamp', price: 5000, stock: 10 });
    await order(big._id, lamp, { quantity: 2 });
    await order(big._id, lamp, { status: 'pending' });

    const res = await agent.get('/api/admin/customers?sort=spent').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.customers[0]).toMatchObject({ name: 'Big Spender', orders: 1, spent: 10000 });

    const detail = await agent.get(`/api/admin/customers/${big.id}`).expect(200);
    expect(detail.body.stats).toMatchObject({ orders: 1, spent: 10000, units: 2 });
    expect(detail.body.orders).toHaveLength(1);
  });

  it('lets owners and admins disable a customer, which signs them out', async () => {
    const email = uniqueEmail();
    const token = await customerToken(email);
    const target = await User.findOne({ email });

    const { agent: staff } = await signedInStaff({ role: 'staff' });
    await staff.patch(`/api/admin/customers/${target!.id}/status`).send({ status: 'disabled' }).expect(403);

    const { agent: admin } = await signedInStaff({ role: 'admin' });
    await admin.patch(`/api/admin/customers/${target!.id}/status`).send({ status: 'disabled' }).expect(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });
});

describe('team console', () => {
  it('lets the owner promote staff but not act on themselves', async () => {
    const { agent, user: owner } = await signedInStaff({ role: 'owner' });
    const { user: staff } = await signedInStaff({ role: 'staff' });

    const list = await agent.get('/api/admin/team').expect(200);
    expect(list.body.members).toHaveLength(2);

    await agent.patch(`/api/admin/team/${staff.id}`).send({ role: 'admin' }).expect(200);
    expect((await User.findById(staff._id))?.role).toBe('admin');
    await agent.patch(`/api/admin/team/${owner.id}`).send({ status: 'disabled' }).expect(400);
  });

  it('keeps admins to managing staff, and disabling ends the member’s session', async () => {
    const { agent: admin } = await signedInStaff({ role: 'admin' });
    const { user: otherAdmin } = await signedInStaff({ role: 'admin' });
    const { user: staff, agent: staffAgent } = await signedInStaff({ role: 'staff' });

    await admin.patch(`/api/admin/team/${otherAdmin.id}`).send({ status: 'disabled' }).expect(403);
    await admin.patch(`/api/admin/team/${staff.id}`).send({ role: 'admin' }).expect(403);

    await staffAgent.get('/api/admin/auth/me').expect(200);
    await admin.patch(`/api/admin/team/${staff.id}`).send({ status: 'disabled' }).expect(200);
    await staffAgent.get('/api/admin/auth/me').expect(401);
  });

  it('is closed to staff', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    await agent.get('/api/admin/team').expect(403);
  });
});

describe('notifications', () => {
  it('counts orders awaiting shipment and low stock', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const buyer = await customer();
    const mug = await Product.create({ name: 'Mug', price: 1000, stock: 1 });
    await order(buyer._id, mug);
    await order(buyer._id, mug, { status: 'shipped' });

    const res = await agent.get('/api/admin/notifications').expect(200);
    expect(res.body).toMatchObject({ awaitingShipment: 1, lowStockCount: 1 });
    expect(res.body.recentOrders).toHaveLength(2);
  });
});

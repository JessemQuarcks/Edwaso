import { describe, expect, it } from 'vitest';
import request from 'supertest';
import AdminInvite from '../src/models/AdminInvite.js';
import AuditLog from '../src/models/AuditLog.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import User from '../src/models/User.js';
import { adminAgent, app, customerToken, PASSWORD, signedInStaff, uniqueEmail } from './helpers.js';

const product = { name: 'Lamp', description: 'Warm light', price: 2599, stock: 4, category: 'home' };

describe('admin catalogue and orders', () => {
  it('moved product writes off the public API', async () => {
    const token = await customerToken();
    await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send(product).expect(404);
  });

  it('creates, updates and deletes products with an audit trail', async () => {
    const { agent, user } = await signedInStaff({ role: 'staff' });
    const created = await agent.post('/api/admin/products').send(product).expect(201);
    const id = created.body.product._id as string;

    await agent.put(`/api/admin/products/${id}`).send({ price: 1999 }).expect(200);
    expect((await Product.findById(id))?.price).toBe(1999);

    await agent.delete(`/api/admin/products/${id}`).expect(200);

    const actions = (await AuditLog.find({ actor: user._id, entityId: id }).sort({ createdAt: 1 })).map((e) => e.action);
    expect(actions).toEqual(['product.create', 'product.update', 'product.delete']);
    const update = await AuditLog.findOne({ action: 'product.update' });
    expect(update?.before).toMatchObject({ price: 2599 });
    expect(update?.after).toMatchObject({ price: 1999 });
  });

  it('validates product input', async () => {
    const { agent } = await signedInStaff();
    const res = await agent.post('/api/admin/products').send({ ...product, price: 12.5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Price must be a whole number');
    await agent.post('/api/admin/products').send({ ...product, image: 'javascript:alert(1)' }).expect(400);
  });

  it('lists orders and changes status', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    const customer = await User.create({ name: 'C', email: uniqueEmail(), password: PASSWORD });
    const p = await Product.create(product);
    const order = await Order.create({
      user: customer._id,
      items: [{ product: p._id, name: p.name, price: p.price, quantity: 1 }],
      total: p.price,
      status: 'paid',
    });

    const list = await agent.get('/api/admin/orders').expect(200);
    expect(list.body.orders[0].user.email).toBe(customer.email);

    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'pending' }).expect(400);
    await agent.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'shipped' }).expect(200);
    expect(await AuditLog.exists({ action: 'order.status', entityId: order.id })).toBeTruthy();
  });

  it('keeps customers out of each other’s orders and admin fields out of storefront responses', async () => {
    const owner = await User.create({ name: 'A', email: uniqueEmail(), password: PASSWORD });
    const order = await Order.create({ user: owner._id, items: [], total: 0, status: 'paid' });
    const token = await customerToken();
    await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${token}`).expect(404);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user).not.toHaveProperty('role');
    expect(me.body.user).not.toHaveProperty('isAdmin');
  });
});

describe('roles', () => {
  it('keeps staff out of invites and the audit log', async () => {
    const { agent } = await signedInStaff({ role: 'staff' });
    await agent.get('/api/admin/invites').expect(403);
    await agent.get('/api/admin/audit').expect(403);
  });

  it('lets admins invite staff but not admins; nobody can invite an owner', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    await agent.post('/api/admin/invites').send({ email: uniqueEmail(), role: 'staff' }).expect(201);
    await agent.post('/api/admin/invites').send({ email: uniqueEmail(), role: 'admin' }).expect(403);

    const { agent: owner } = await signedInStaff({ role: 'owner' });
    await owner.post('/api/admin/invites').send({ email: uniqueEmail(), role: 'admin' }).expect(201);
    await owner.post('/api/admin/invites').send({ email: uniqueEmail(), role: 'owner' }).expect(400);
  });
});

describe('invites', () => {
  async function invite(email = uniqueEmail('invitee')) {
    const { agent } = await signedInStaff({ role: 'owner' });
    const res = await agent.post('/api/admin/invites').send({ email, role: 'staff' }).expect(201);
    const token = (res.body.inviteUrl as string).split('/admin/invite/')[1]!;
    return { agent, email, token, id: res.body.invite._id as string };
  }

  it('redeems once into a restricted session that must enrol 2FA', async () => {
    const { email, token } = await invite();
    const info = await request(app).get(`/api/admin/invitations/${token}`).expect(200);
    expect(info.body).toMatchObject({ email, role: 'staff' });

    const agent = adminAgent();
    await agent.post(`/api/admin/invitations/${token}/accept`).send({ name: 'New', password: 'short' }).expect(400);
    const accepted = await agent
      .post(`/api/admin/invitations/${token}/accept`)
      .send({ name: 'New', password: 'a-long-enough-password' })
      .expect(201);
    expect(accepted.body.pendingSteps).toEqual(['enroll_2fa']);
    expect((await User.findOne({ email }))?.role).toBe('staff');
    await agent.get('/api/admin/orders').expect(403);

    await adminAgent()
      .post(`/api/admin/invitations/${token}/accept`)
      .send({ name: 'Again', password: 'a-long-enough-password' })
      .expect(404);
  });

  it('never attaches staff access to an existing account', async () => {
    const email = uniqueEmail();
    const { agent } = await signedInStaff({ role: 'owner' });
    await customerToken(email);
    await agent.post('/api/admin/invites').send({ email, role: 'staff' }).expect(409);
  });

  it('can be revoked, and a re-invite replaces the old link', async () => {
    const { agent, email, token, id } = await invite();
    const again = await agent.post('/api/admin/invites').send({ email, role: 'staff' }).expect(201);
    await request(app).get(`/api/admin/invitations/${token}`).expect(404);

    await agent.delete(`/api/admin/invites/${again.body.invite._id}`).expect(204);
    const newToken = (again.body.inviteUrl as string).split('/admin/invite/')[1]!;
    await request(app).get(`/api/admin/invitations/${newToken}`).expect(404);
    expect(await AdminInvite.countDocuments({ revokedAt: { $exists: true } })).toBe(2);
    expect(id).not.toBe(again.body.invite._id);
  });

  it('expires', async () => {
    const { token } = await invite();
    await AdminInvite.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).get(`/api/admin/invitations/${token}`).expect(404);
  });
});

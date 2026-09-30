import { describe, expect, it } from 'vitest';
import request from 'supertest';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import Subscriber from '../src/models/Subscriber.js';
import User from '../src/models/User.js';
import { app, customerToken, PASSWORD, signedInStaff, uniqueEmail } from './helpers.js';

const STOREFRONT = {
  announcement: 'Free shipping over $50',
  heroEyebrow: 'Autumn',
  heroTitle: 'Goods for slow mornings.',
  heroSubtitle: 'Made to last.',
  promo: { title: 'The travel edit', body: 'Bags that go anywhere.', ctaLabel: 'Shop bags', ctaHref: '/shop?category=bags', image: '' },
  testimonials: [{ quote: 'Lovely backpack.', author: 'Ama O.', detail: 'Accra' }],
  social: { instagram: 'https://instagram.com/kosmik', facebook: '', x: '', tiktok: '' },
};

describe('storefront settings', () => {
  it('lets admins edit landing content and serves it publicly', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    const defaults = await request(app).get('/api/settings').expect(200);
    expect(defaults.body.storefront.heroTitle).toBeTruthy();
    expect(defaults.body.storefront.testimonials).toEqual([]);

    await agent.patch('/api/admin/settings').send({ storefront: STOREFRONT }).expect(200);
    const pub = await request(app).get('/api/settings').expect(200);
    expect(pub.body.storefront).toMatchObject(STOREFRONT);
  });

  it('refuses unsafe links in storefront content', async () => {
    const { agent } = await signedInStaff({ role: 'admin' });
    for (const ctaHref of ['javascript:alert(1)', '//evil.example', 'http://plain.example']) {
      await agent
        .patch('/api/admin/settings')
        .send({ storefront: { ...STOREFRONT, promo: { ...STOREFRONT.promo, ctaHref } } })
        .expect(400);
    }
    await agent
      .patch('/api/admin/settings')
      .send({ storefront: { ...STOREFRONT, social: { ...STOREFRONT.social, x: 'javascript:alert(1)' } } })
      .expect(400);
  });
});

describe('catalogue browsing', () => {
  it('filters by price and featured, sorts, and excludes a product', async () => {
    const [alpha] = await Product.create([
      { name: 'Alpha', price: 1_000, stock: 1, featured: true, category: 'home' },
      { name: 'Beta', price: 5_000, stock: 0, category: 'home' },
      { name: 'Gamma', price: 9_000, stock: 3, category: 'bags' },
    ]);
    const names = (res: request.Response) => res.body.products.map((p: { name: string }) => p.name);

    expect(names(await request(app).get('/api/products?sort=price_desc'))).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(names(await request(app).get('/api/products?minPrice=2000&maxPrice=9000&sort=price_asc'))).toEqual(['Beta', 'Gamma']);
    expect(names(await request(app).get('/api/products?featured=true'))).toEqual(['Alpha']);
    expect(names(await request(app).get('/api/products?inStock=true&sort=name'))).toEqual(['Alpha', 'Gamma']);
    expect(names(await request(app).get(`/api/products?category=home&exclude=${alpha!.id}`))).toEqual(['Beta']);
  });

  it('gives categories a picture and a count', async () => {
    await Product.create([
      { name: 'Bottle', price: 1, stock: 1, category: 'home', image: 'https://img.example/bottle.jpg' },
      { name: 'Mug', price: 1, stock: 1, category: 'home' },
      { name: 'Hidden', price: 1, stock: 1, category: 'secret', status: 'draft' },
    ]);
    const res = await request(app).get('/api/products/categories').expect(200);
    expect(res.body.items).toEqual([{ slug: 'home', name: 'Home', description: '', image: 'https://img.example/bottle.jpg', count: 2 }]);
  });
});

describe('newsletter', () => {
  it('subscribes once, answering the same either way', async () => {
    const first = await request(app).post('/api/newsletter').send({ email: 'Fan@Example.com' }).expect(200);
    const again = await request(app).post('/api/newsletter').send({ email: 'fan@example.com' }).expect(200);
    expect(again.body).toEqual(first.body);
    expect(await Subscriber.countDocuments()).toBe(1);
    await request(app).post('/api/newsletter').send({ email: 'nope' }).expect(400);

    const { agent } = await signedInStaff({ role: 'admin' });
    const csv = await agent.get('/api/admin/customers/subscribers/export').expect(200);
    expect(csv.text).toContain('fan@example.com');
  });
});

describe('customer account', () => {
  it('updates the name and changes the password, signing out other devices', async () => {
    const email = uniqueEmail();
    const token = await customerToken(email);
    const auth = { Authorization: `Bearer ${token}` };

    const renamed = await request(app).patch('/api/auth/me').set(auth).send({ name: 'Ama Owusu' }).expect(200);
    expect(renamed.body.user.name).toBe('Ama Owusu');

    await request(app).post('/api/auth/password').set(auth).send({ currentPassword: 'wrong', newPassword: 'another-password' }).expect(400);
    const changed = await request(app)
      .post('/api/auth/password')
      .set(auth)
      .send({ currentPassword: PASSWORD, newPassword: 'another-password' })
      .expect(200);
    await request(app).get('/api/auth/me').set(auth).expect(401);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${changed.body.token}`).expect(200);
  });

  it('keeps the admin minimum for staff accounts', async () => {
    const email = uniqueEmail();
    const token = await customerToken(email);
    await User.updateOne({ email }, { role: 'staff' });
    const res = await request(app)
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'short-pass' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 12/);
  });

  it('shows tracking and progress on the order, without staff notes', async () => {
    const email = uniqueEmail();
    const token = await customerToken(email);
    const user = await User.findOne({ email });
    const order = await Order.create({
      user: user!._id,
      items: [{ product: user!._id, name: 'Lamp', price: 1_000, quantity: 1 }],
      total: 1_000,
      status: 'shipped',
      fulfillment: { carrier: 'DHL', trackingNumber: 'JD1', trackingUrl: 'https://track.example/JD1', shippedAt: new Date() },
      statusHistory: [{ status: 'shipped', at: new Date(), by: user!._id, note: 'Customer seemed rude' }],
    });
    const res = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.order.fulfillment).toMatchObject({ carrier: 'DHL', trackingNumber: 'JD1' });
    expect(res.body.order.statusHistory[0]).toEqual(expect.objectContaining({ status: 'shipped' }));
    expect(res.body.order.statusHistory[0]).not.toHaveProperty('by');
    expect(JSON.stringify(res.body)).not.toContain('rude');
  });
});

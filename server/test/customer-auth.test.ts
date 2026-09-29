import { describe, expect, it } from 'vitest';
import request from 'supertest';
import User from '../src/models/User.js';
import { AUDIENCE, signToken } from '../src/lib/tokens.js';
import { app, PASSWORD, uniqueEmail } from './helpers.js';

describe('storefront auth', () => {
  it('registers a customer and ignores any role in the body', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ann', email: email.toUpperCase(), password: PASSWORD, role: 'owner', isAdmin: true })
      .expect(201);

    expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ann', email });
    const user = await User.findOne({ email });
    expect(user?.role).toBe('customer');
  });

  it('validates registration input', async () => {
    const bad = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: PASSWORD });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Enter a valid email address');

    const short = await request(app).post('/api/auth/register').send({ name: 'A', email: uniqueEmail(), password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/at least 8/);
  });

  it('rejects duplicate emails', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: PASSWORD }).expect(201);
    await request(app).post('/api/auth/register').send({ name: 'B', email, password: PASSWORD }).expect(409);
  });

  it('logs in and resolves /me', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: PASSWORD }).expect(201);

    await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
    expect(me.body.user.email).toBe(email);
  });

  it('revokes tokens when tokenVersion changes', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email, password: PASSWORD });
    await User.updateOne({ email }, { $inc: { tokenVersion: 1 } });
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(401);
  });

  it('blocks disabled accounts', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email, password: PASSWORD });
    await User.updateOne({ email }, { status: 'disabled' });
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(403);
    await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(403);
  });

  it('does not accept tokens minted for another audience', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: PASSWORD });
    const user = await User.findOne({ email });
    const challenge = signToken({ sub: user!.id, tv: 0 }, AUDIENCE.admin2fa, '5m');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${challenge}`).expect(401);
  });
});

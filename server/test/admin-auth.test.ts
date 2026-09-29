import { describe, expect, it } from 'vitest';
import request from 'supertest';
import AdminSession from '../src/models/AdminSession.js';
import AuditLog from '../src/models/AuditLog.js';
import User from '../src/models/User.js';
import { SESSION_IDLE_MS } from '../src/middleware/adminSession.js';
import { adminAgent, app, createUser, customerToken, ORIGIN, PASSWORD, signIn, signedInStaff, totpCode, uniqueEmail } from './helpers.js';

const login = (email: string, password = PASSWORD) =>
  adminAgent().post('/api/admin/auth/login').send({ email, password });

describe('admin sign-in', () => {
  it('requires a TOTP code after the password, then sets an httpOnly SameSite=Strict cookie', async () => {
    const { user, secret } = await createUser();
    const step1 = await login(user.email).expect(200);
    expect(step1.body).toEqual({ status: '2fa_required', challenge: expect.any(String) });
    expect(step1.headers['set-cookie']).toBeUndefined();

    const step2 = await adminAgent()
      .post('/api/admin/auth/login/2fa')
      .send({ challenge: step1.body.challenge, code: totpCode(secret) })
      .expect(200);
    expect(step2.body.pendingSteps).toEqual([]);
    const cookie = String(step2.headers['set-cookie']);
    expect(cookie).toMatch(/^admin_sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);

    // Only a hash of the token is stored.
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const session = await AdminSession.findOne({ user: user._id });
    expect(session?.tokenHash).not.toBe(token);
    expect(await AuditLog.exists({ action: 'auth.login', actor: user._id })).toBeTruthy();
  });

  it('gives customers and unknown emails the same answer as a wrong password', async () => {
    const email = uniqueEmail();
    await customerToken(email);
    const customer = await login(email).expect(401);
    const unknown = await login(uniqueEmail()).expect(401);
    const { user } = await createUser();
    const wrong = await login(user.email, 'not-the-password').expect(401);
    expect(customer.body.message).toBe(wrong.body.message);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('rejects a wrong or replayed TOTP code', async () => {
    const { user, secret } = await createUser();
    const step1 = await login(user.email);
    await adminAgent().post('/api/admin/auth/login/2fa').send({ challenge: step1.body.challenge, code: '000000' }).expect(401);

    await signIn(user.email, secret);
    // The same code again, within the same 30s window.
    const again = await login(user.email);
    await adminAgent()
      .post('/api/admin/auth/login/2fa')
      .send({ challenge: again.body.challenge, code: totpCode(secret) })
      .expect(401);
  });

  it('locks the account after 5 failed attempts', async () => {
    const { user } = await createUser();
    for (let i = 0; i < 5; i++) await login(user.email, 'wrong-password').expect(401);
    const locked = await login(user.email).expect(429);
    expect(locked.body.message).toMatch(/15 minutes/);
    expect(await AuditLog.exists({ action: 'auth.locked', actor: user._id })).toBeTruthy();
  });

  it('refuses disabled staff', async () => {
    const { user } = await createUser({ status: 'disabled' });
    await login(user.email).expect(403);
  });

  it('accepts a recovery code exactly once', async () => {
    const { user, agent } = await signedInStaff({ totp: false });
    // Enrol through the API to get real recovery codes.
    const setup = await agent.post('/api/admin/auth/2fa/setup').expect(200);
    const enabled = await agent
      .post('/api/admin/auth/2fa/enable')
      .send({ code: totpCode(setup.body.secret) })
      .expect(200);
    const [code] = enabled.body.recoveryCodes as string[];
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    const first = await login(user.email);
    await adminAgent().post('/api/admin/auth/login/2fa').send({ challenge: first.body.challenge, code }).expect(200);
    const second = await login(user.email);
    await adminAgent().post('/api/admin/auth/login/2fa').send({ challenge: second.body.challenge, code }).expect(401);
  });
});

describe('admin session', () => {
  it('refuses storefront Bearer tokens on every admin route, even for an owner account', async () => {
    const email = uniqueEmail();
    const token = await customerToken(email);
    await User.updateOne({ email }, { role: 'owner' });

    for (const path of ['/api/admin/auth/me', '/api/admin/orders', '/api/admin/sessions']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      expect(res.status, path).toBe(401);
    }
  });

  it('logs out and invalidates the session server-side', async () => {
    const { agent } = await signedInStaff();
    await agent.get('/api/admin/auth/me').expect(200);
    await agent.post('/api/admin/auth/logout').expect(204);
    await agent.get('/api/admin/auth/me').expect(401);
    expect(await AdminSession.countDocuments()).toBe(0);
  });

  it('expires after the idle timeout', async () => {
    const { user, agent } = await signedInStaff();
    await AdminSession.updateMany({ user: user._id }, { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 1000) });
    await agent.get('/api/admin/auth/me').expect(401);
  });

  it('dies when the user is demoted to customer', async () => {
    const { user, agent } = await signedInStaff();
    await User.updateOne({ _id: user._id }, { role: 'customer' });
    await agent.get('/api/admin/auth/me').expect(401);
  });

  it('blocks cross-origin writes (CSRF)', async () => {
    const { agent } = await signedInStaff();
    const res = await agent
      .post('/api/admin/products')
      .set('Origin', 'https://evil.example')
      .send({ name: 'X', price: 1, stock: 1 });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Cross-site request blocked');
    expect(ORIGIN).toBe(process.env.CLIENT_URL);
  });

  it('lists and revokes the admin’s own sessions', async () => {
    const { user, secret, agent } = await signedInStaff();
    const other = await signIn(user.email, secret, 1);

    const list = await agent.get('/api/admin/sessions').expect(200);
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    await agent.delete('/api/admin/sessions').expect(200);
    await other.get('/api/admin/auth/me').expect(401);
    await agent.get('/api/admin/auth/me').expect(200);
  });
});

describe('account setup', () => {
  it('restricts a new account to setup until 2FA is enrolled', async () => {
    const { user } = await createUser({ totp: false });
    const agent = adminAgent();
    const res = await agent.post('/api/admin/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    expect(res.body.pendingSteps).toEqual(['enroll_2fa']);

    await agent.get('/api/admin/orders').expect(403);

    const setup = await agent.post('/api/admin/auth/2fa/setup').expect(200);
    expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
    await agent.post('/api/admin/auth/2fa/enable').send({ code: '123456' }).expect(400);
    await agent.post('/api/admin/auth/2fa/enable').send({ code: totpCode(setup.body.secret) }).expect(200);

    await agent.get('/api/admin/orders').expect(200);
    const stored = await User.findById(user._id).select('+totpSecret');
    expect(stored?.totpSecret).not.toContain(setup.body.secret);
  });

  it('forces a password change, then revokes other sessions', async () => {
    const { user, secret } = await createUser({ mustChangePassword: true });
    const agent = await signIn(user.email, secret);
    const other = await signIn(user.email, secret, 1);
    await agent.get('/api/admin/orders').expect(403);

    await agent
      .post('/api/admin/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: 'short' })
      .expect(400);
    const changed = await agent
      .post('/api/admin/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-long-password' })
      .expect(200);
    expect(changed.body.pendingSteps).toEqual([]);

    await agent.get('/api/admin/orders').expect(200);
    await other.get('/api/admin/auth/me').expect(401);
  });
});

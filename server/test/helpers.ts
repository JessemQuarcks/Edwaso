import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { authenticator } from 'otplib';
import { createApp } from '../src/app.js';
import User, { type Role } from '../src/models/User.js';
import { encrypt } from '../src/lib/crypto.js';

export const app = createApp();
export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct-horse-battery';

export const uniqueEmail = (prefix = 'user'): string => `${prefix}-${randomUUID().slice(0, 8)}@example.com`;

interface StaffOptions {
  role?: Role;
  totp?: boolean;
  mustChangePassword?: boolean;
  status?: 'active' | 'disabled';
}

/** Creates a user directly in the database. `totp: true` enrols 2FA and returns the secret. */
export async function createUser({ role = 'owner', totp = true, mustChangePassword = false, status = 'active' }: StaffOptions = {}) {
  const secret = authenticator.generateSecret();
  const user = await User.create({
    name: `${role} user`,
    email: uniqueEmail(role),
    password: PASSWORD,
    role,
    status,
    mustChangePassword,
    ...(totp ? { totpEnabled: true, totpSecret: encrypt(secret) } : {}),
  });
  return { user, secret };
}

/** A cookie-keeping client that sends the storefront Origin, like the browser via the Next proxy. */
export function adminAgent() {
  return request.agent(app).set('Origin', ORIGIN);
}

/** Current TOTP code, offset by whole 30s steps (the server accepts ±1 step). */
export const totpCode = (secret: string, stepOffset = 0): string =>
  authenticator.clone({ epoch: Date.now() + stepOffset * 30_000 }).generate(secret);

/**
 * Signs in (password, then TOTP when enrolled). Returns the agent holding the session cookie.
 * Pass a different `stepOffset` to sign the same user in twice within one 30s window, since
 * the server refuses a replayed code.
 */
export async function signIn(email: string, secret: string, stepOffset = 0) {
  const agent = adminAgent();
  const step1 = await agent.post('/api/admin/auth/login').send({ email, password: PASSWORD }).expect(200);
  if (step1.body.status === 'ok') return agent; // not enrolled yet: restricted setup session
  await agent
    .post('/api/admin/auth/login/2fa')
    .send({ challenge: step1.body.challenge, code: totpCode(secret, stepOffset) })
    .expect(200);
  return agent;
}

export async function signedInStaff(options: StaffOptions = {}) {
  const { user, secret } = await createUser(options);
  const agent = await signIn(user.email, secret);
  return { user, secret, agent };
}

/** Storefront (customer) Bearer token for a freshly registered account. */
export async function customerToken(email = uniqueEmail('customer')) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Customer', email, password: PASSWORD })
    .expect(201);
  return res.body.token as string;
}

import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import AdminSession from '../../models/AdminSession.js';
import User, { ADMIN_MIN_PASSWORD, isAdminRole, type UserDoc } from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { emailSchema, parse, passwordSchema } from '../../middleware/validate.js';
import {
  clearAdminCookie,
  pendingSteps,
  readSessionToken,
  requireAdmin,
  requireAdminSession,
  SESSION_IDLE_MS,
  startAdminSession,
} from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { decrypt, encrypt, randomToken, sha256 } from '../../lib/crypto.js';
import { AUDIENCE, signToken, verifyToken } from '../../lib/tokens.js';

const router = Router();

export const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Shop Admin';

// Accept the current code plus one 30s step either side for clock drift.
authenticator.options = { window: 1 };

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync(randomToken(), 12);

const INVALID_CREDENTIALS = 'Invalid email or password';

// Throttles per IP and per sign-in attempt (the email for step 1, the challenge for step 2),
// on top of the per-account lockout below.
const signInLimiter = (field: 'email' | 'challenge') =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const value = (req.body as Record<string, unknown> | undefined)?.[field];
      return `${req.ip}|${sha256(String(value ?? '').toLowerCase())}`;
    },
    message: { message: 'Too many sign-in attempts. Try again later.' },
  });
const passwordLimiter = signInLimiter('email');
const twoFactorLimiter = signInLimiter('challenge');

export interface PublicAdmin {
  id: string;
  name: string;
  email: string;
  role: UserDoc['role'];
  totpEnabled: boolean;
}

export const publicAdmin = (u: UserDoc): PublicAdmin => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  role: u.role,
  totpEnabled: u.totpEnabled,
});

const isLocked = (user: UserDoc): boolean => !!user.lockUntil && user.lockUntil.getTime() > Date.now();

async function recordFailure(req: Request, user: UserDoc, reason: string): Promise<void> {
  user.failedLoginAttempts += 1;
  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockUntil = new Date(Date.now() + LOCK_MS);
    user.failedLoginAttempts = 0;
    await audit(req, 'auth.locked', { actor: user, entity: 'User', entityId: user.id });
  }
  await user.save();
  await audit(req, 'auth.login_failed', { actor: user, meta: { reason } });
}

async function completeLogin(req: Request, res: Response, user: UserDoc) {
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await startAdminSession(req, res, user);
  await audit(req, 'auth.login', { actor: user });
  return { status: 'ok' as const, user: publicAdmin(user), pendingSteps: pendingSteps(user) };
}

/** Verifies a TOTP code and rejects reuse of an already-accepted time step. */
function checkTotp(user: UserDoc, code: string): boolean {
  if (!user.totpSecret) return false;
  const delta = authenticator.checkDelta(code, decrypt(user.totpSecret));
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 30_000) + delta;
  if (user.totpLastStep !== undefined && step <= user.totpLastStep) return false;
  user.totpLastStep = step;
  return true;
}

/** Consumes a recovery code if it matches one of the stored hashes. */
function useRecoveryCode(user: UserDoc, code: string): boolean {
  const hash = sha256(code.trim().toLowerCase());
  const index = user.recoveryCodes.indexOf(hash);
  if (index === -1) return false;
  user.recoveryCodes.splice(index, 1);
  return true;
}

function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  // 40 random bits each, formatted xxxxx-xxxxx.
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const hex = randomBytes(5).toString('hex');
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
  return { plain, hashes: plain.map((c) => sha256(c)) };
}

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

// Step 1: password. Returns a short-lived 2FA challenge, or (for an account that has not
// enrolled 2FA yet) a restricted session that can only finish account setup.
router.post(
  '/login',
  passwordLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await audit(req, 'auth.login_failed', { actor: null, meta: { email, reason: 'unknown_email' } });
      throw new HttpError(401, INVALID_CREDENTIALS);
    }
    if (isLocked(user)) {
      throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    }

    const passwordOk = await user.matchPassword(password);
    // Customer accounts get the same answer as a wrong password: the admin login
    // shouldn't confirm which storefront emails exist.
    if (!isAdminRole(user.role)) {
      await audit(req, 'auth.login_failed', { actor: user, meta: { reason: 'not_admin' } });
      throw new HttpError(401, INVALID_CREDENTIALS);
    }
    if (!passwordOk) {
      await recordFailure(req, user, 'bad_password');
      throw new HttpError(401, INVALID_CREDENTIALS);
    }
    if (user.status !== 'active') {
      await audit(req, 'auth.login_failed', { actor: user, meta: { reason: 'disabled' } });
      throw new HttpError(403, 'This account has been disabled');
    }

    if (user.totpEnabled) {
      const challenge = signToken({ sub: user.id, tv: user.tokenVersion }, AUDIENCE.admin2fa, '5m');
      res.json({ status: '2fa_required', challenge });
      return;
    }
    res.json(await completeLogin(req, res, user));
  })
);

const twoFactorSchema = z.object({
  challenge: z.string({ error: 'Sign in again' }).min(1),
  code: z.string({ error: 'Enter your code' }).trim().min(6, 'Enter your code').max(20),
});

// Step 2: TOTP code or a one-time recovery code.
router.post(
  '/login/2fa',
  twoFactorLimiter,
  asyncHandler(async (req, res) => {
    const { challenge, code } = parse(twoFactorSchema, req.body);
    const claims = verifyToken(challenge, AUDIENCE.admin2fa);
    if (!claims) throw new HttpError(401, 'Your sign-in attempt expired. Please start again.');

    const user = await User.findById(claims.sub).select('+totpSecret +recoveryCodes');
    if (!user || user.tokenVersion !== claims.tv || !isAdminRole(user.role) || user.status !== 'active') {
      throw new HttpError(401, 'Your sign-in attempt expired. Please start again.');
    }
    if (isLocked(user)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

    const isTotp = /^\d{6}$/.test(code);
    const ok = isTotp ? checkTotp(user, code) : useRecoveryCode(user, code);
    if (!ok) {
      await recordFailure(req, user, isTotp ? 'bad_totp' : 'bad_recovery_code');
      throw new HttpError(401, 'That code is not valid');
    }
    if (!isTotp) {
      await audit(req, 'auth.recovery_code_used', {
        actor: user,
        meta: { remaining: user.recoveryCodes.length },
      });
    }
    res.json(await completeLogin(req, res, user));
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = readSessionToken(req);
    if (token) {
      const session = await AdminSession.findOneAndDelete({ tokenHash: sha256(token) });
      if (session) {
        const user = await User.findById(session.user);
        await audit(req, 'auth.logout', { actor: user });
      }
    }
    clearAdminCookie(res);
    res.status(204).end();
  })
);

// Everything below needs a session, but not a completed account setup.
router.use(requireAdminSession);

router.get('/me', (req, res) => {
  const { user, session } = requireAdmin(req);
  res.json({
    user: publicAdmin(user),
    pendingSteps: pendingSteps(user),
    session: {
      expiresAt: session.expiresAt,
      idleTimeoutMinutes: SESSION_IDLE_MS / 60_000,
    },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Enter your current password' }).min(1, 'Enter your current password'),
  newPassword: passwordSchema(ADMIN_MIN_PASSWORD),
});

// Revokes every session (including this one) and starts a fresh session for this browser.
router.post(
  '/password',
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    const user = await User.findById(requireAdmin(req).user._id).select('+password');
    if (!user) throw new HttpError(401, 'Not signed in');
    if (!(await user.matchPassword(currentPassword))) throw new HttpError(400, 'Current password is incorrect');
    if (await user.matchPassword(newPassword)) {
      throw new HttpError(400, 'Choose a password you have not used for this account');
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    user.tokenVersion += 1;
    await user.save();
    await AdminSession.deleteMany({ user: user._id });
    await startAdminSession(req, res, user);
    await audit(req, 'auth.password_changed', { actor: user, entity: 'User', entityId: user.id });
    res.json({ user: publicAdmin(user), pendingSteps: pendingSteps(user) });
  })
);

// Starts (or restarts) 2FA enrolment. Nothing is enforced until /2fa/enable confirms a code.
router.post(
  '/2fa/setup',
  asyncHandler(async (req, res) => {
    const user = requireAdmin(req).user;
    if (user.totpEnabled) throw new HttpError(409, 'Two-factor authentication is already enabled');

    const secret = authenticator.generateSecret();
    user.totpSecret = encrypt(secret);
    user.totpLastStep = undefined;
    await user.save();

    const otpauthUrl = authenticator.keyuri(user.email, TOTP_ISSUER, secret);
    res.json({ secret, otpauthUrl, qrCode: await QRCode.toDataURL(otpauthUrl) });
  })
);

const enableSchema = z.object({
  code: z.string({ error: 'Enter the 6-digit code' }).trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

router.post(
  '/2fa/enable',
  asyncHandler(async (req, res) => {
    const { code } = parse(enableSchema, req.body);
    const user = await User.findById(requireAdmin(req).user._id).select('+totpSecret');
    if (!user) throw new HttpError(401, 'Not signed in');
    if (user.totpEnabled) throw new HttpError(409, 'Two-factor authentication is already enabled');
    if (!user.totpSecret) throw new HttpError(400, 'Start two-factor setup first');
    if (!checkTotp(user, code)) throw new HttpError(400, 'That code is not valid. Check your device clock and try again.');

    const { plain, hashes } = generateRecoveryCodes();
    user.totpEnabled = true;
    user.recoveryCodes = hashes;
    await user.save();
    await audit(req, 'auth.2fa_enabled', { actor: user, entity: 'User', entityId: user.id });
    // The only time the plain recovery codes are ever returned.
    res.json({ user: publicAdmin(user), pendingSteps: pendingSteps(user), recoveryCodes: plain });
  })
);

export default router;

import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import AdminSession, { type AdminSessionDoc } from '../models/AdminSession.js';
import User, { isAdminRole, type Role, type UserDoc } from '../models/User.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { asyncHandler, HttpError } from './error.js';

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
/** Don't write lastSeenAt on every request. */
const TOUCH_INTERVAL_MS = 60 * 1000;

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

// `__Host-` makes the browser insist on Secure, Path=/ and no Domain, so the cookie can't be
// set or shadowed by a subdomain. Browsers reject that prefix over plain http, hence dev falls back.
export const adminCookieName = (): string => (isProduction() ? '__Host-admin_sid' : 'admin_sid');

// Path=/ (not /api/admin) so the Next.js middleware can see it on /admin pages. No maxAge:
// it's a browser-session cookie, and the server enforces the idle and absolute timeouts.
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'strict',
  path: '/',
});

export type PendingStep = 'change_password' | 'enroll_2fa';

/** Account setup the admin must finish before using anything but the auth endpoints. */
export function pendingSteps(user: UserDoc): PendingStep[] {
  const steps: PendingStep[] = [];
  if (user.mustChangePassword) steps.push('change_password');
  if (!user.totpEnabled) steps.push('enroll_2fa');
  return steps;
}

export async function startAdminSession(req: Request, res: Response, user: UserDoc): Promise<AdminSessionDoc> {
  const token = randomToken();
  const now = Date.now();
  const session = await AdminSession.create({
    user: user._id,
    tokenHash: sha256(token),
    tokenVersion: user.tokenVersion,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
    lastSeenAt: new Date(now),
    expiresAt: new Date(now + SESSION_MAX_MS),
  });
  res.cookie(adminCookieName(), token, cookieOptions());
  return session;
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(adminCookieName(), cookieOptions());
}

export const readSessionToken = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[adminCookieName()];
  return typeof value === 'string' && value ? value : undefined;
};

/** Authenticates the admin cookie. Customer Bearer tokens are refused outright. */
export const requireAdminSession = asyncHandler(async (req, res, next) => {
  if (req.headers.authorization) {
    throw new HttpError(401, 'The admin API does not accept storefront tokens');
  }
  const token = readSessionToken(req);
  if (!token) throw new HttpError(401, 'Not signed in');

  const session = await AdminSession.findOne({ tokenHash: sha256(token) });
  const now = Date.now();
  const expired =
    !session || session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + SESSION_IDLE_MS <= now;

  const user = !expired ? await User.findById(session.user) : null;
  const valid =
    user && user.status === 'active' && isAdminRole(user.role) && user.tokenVersion === session?.tokenVersion;

  if (!session || !user || !valid || expired) {
    if (session) await session.deleteOne();
    clearAdminCookie(res);
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    session.lastSeenAt = new Date(now);
    await session.save();
  }

  req.admin = { user, session };
  next();
});

/** Blocks everything except the auth endpoints until the password is changed and 2FA enrolled. */
export const requireSetupComplete: RequestHandler = (req, _res, next) => {
  const { user } = requireAdmin(req);
  if (pendingSteps(user).length > 0) {
    return next(new HttpError(403, 'Finish setting up your account (password and two-factor) first'));
  }
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    const { user } = requireAdmin(req);
    if (!roles.includes(user.role)) return next(new HttpError(403, 'You do not have permission to do that'));
    next();
  };

/**
 * CSRF defence in depth on top of SameSite=Strict: a state-changing request must come from
 * the storefront's own origin. Modern browsers always send Origin on POST/PUT/PATCH/DELETE.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('origin') !== process.env.CLIENT_URL) {
    return next(new HttpError(403, 'Cross-site request blocked'));
  }
  next();
};

/** Narrows `req.admin` for handlers behind `requireAdminSession`. */
export function requireAdmin(req: Request): NonNullable<Request['admin']> {
  if (!req.admin) throw new HttpError(401, 'Not signed in');
  return req.admin;
}

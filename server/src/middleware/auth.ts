import type { Request } from 'express';
import User, { type UserDoc } from '../models/User.js';
import { AUDIENCE, verifyToken } from '../lib/tokens.js';
import { asyncHandler, HttpError } from './error.js';

// Storefront (customer) authentication: a Bearer JWT. The admin console never accepts
// these tokens; it has its own cookie session (middleware/adminSession.ts).
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not authenticated');

  const claims = verifyToken(token, AUDIENCE.customer);
  if (!claims) throw new HttpError(401, 'Invalid or expired token');

  const user = await User.findById(claims.sub);
  if (!user || user.tokenVersion !== claims.tv) throw new HttpError(401, 'Session is no longer valid');
  if (user.status !== 'active') throw new HttpError(403, 'Account disabled');
  req.user = user;
  next();
});

/** Narrows `req.user` for handlers that run behind `protect`. */
export function requireUser(req: Request): UserDoc {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

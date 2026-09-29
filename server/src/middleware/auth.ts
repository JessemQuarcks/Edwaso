import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import User, { type UserDoc } from '../models/User.js';
import { asyncHandler, HttpError } from './error.js';

export interface TokenPayload {
  id: string;
}

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not authenticated');

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, secret) as TokenPayload;
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) throw new HttpError(401, 'User no longer exists');
  req.user = user;
  next();
});

export const adminOnly: RequestHandler = (req, _res, next) => {
  if (!req.user?.isAdmin) return next(new HttpError(403, 'Admin access required'));
  next();
};

/** Narrows `req.user` for handlers that run behind `protect`. */
export function requireUser(req: Request): UserDoc {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

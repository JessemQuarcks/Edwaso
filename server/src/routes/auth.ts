import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User, { type UserDoc } from '../models/User.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

function signToken(user: UserDoc): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ id: user._id.toString() }, secret, { expiresIn: '7d' });
}

const publicUser = (u: UserDoc): PublicUser => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  isAdmin: u.isAdmin,
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'Name, email and password are required');
    }
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (await User.exists({ email: email.toLowerCase() })) {
      throw new HttpError(409, 'Email already registered');
    }
    // isAdmin is never taken from the request body.
    const user = await User.create({ name, email, password, isAdmin: false });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'Email and password are required');
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(requireUser(req)) });
});

export default router;

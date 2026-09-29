import { Router } from 'express';
import { z } from 'zod';
import User, { CUSTOMER_MIN_PASSWORD, type UserDoc } from '../models/User.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { emailSchema, parse, passwordSchema } from '../middleware/validate.js';
import { AUDIENCE, signToken } from '../lib/tokens.js';

// Storefront accounts. Signing in here never grants admin access, whatever the account's role:
// the admin console has its own login at /api/admin/auth.
const router = Router();

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

const issueToken = (user: UserDoc): string =>
  signToken({ sub: user._id.toString(), tv: user.tokenVersion }, AUDIENCE.customer, '7d');

const publicUser = (u: UserDoc): PublicUser => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
});

const registerSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(100),
  email: emailSchema,
  password: passwordSchema(CUSTOMER_MIN_PASSWORD),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = parse(registerSchema, req.body);
    if (await User.exists({ email })) throw new HttpError(409, 'Email already registered');
    // The role is never taken from the request body.
    const user = await User.create({ name, email, password, role: 'customer' });
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (user.status !== 'active') throw new HttpError(403, 'Account disabled');
    res.json({ token: issueToken(user), user: publicUser(user) });
  })
);

router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(requireUser(req)) });
});

export default router;

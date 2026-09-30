import { Router } from 'express';
import { z } from 'zod';
import User, { CUSTOMER_MIN_PASSWORD, type UserDoc } from '../models/User.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { emailSchema, parse, passwordSchema } from '../middleware/validate.js';
import { AUDIENCE, signToken } from '../lib/tokens.js';
import rateLimit from 'express-rate-limit';
import { sha256 } from '../lib/crypto.js';
import { startPasswordReset } from '../lib/password-reset.js';

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

// Per email as well as per IP, so one address can't be flooded with reset emails.
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String((req.body as { email?: unknown })?.email ?? '').toLowerCase()}`,
  message: { message: 'Too many reset requests. Try again later.' },
});

// Always the same answer, so the form can't be used to find out which emails have accounts.
// Staff accounts are reset from the admin CLI, not by email.
router.post(
  '/forgot',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const user = await User.findOne({ email, role: 'customer', status: 'active' });
    if (user) await startPasswordReset(user);
    res.json({ message: 'If that email has an account, we’ve sent a link to reset the password.' });
  })
);

const resetSchema = z.object({
  token: z.string({ error: 'This reset link is invalid' }).min(20, 'This reset link is invalid').max(200),
  password: passwordSchema(CUSTOMER_MIN_PASSWORD),
});

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const { token, password } = parse(resetSchema, req.body);
    const user = await User.findOne({
      resetTokenHash: sha256(token),
      resetTokenExpires: { $gt: new Date() },
      role: 'customer',
    }).select('+resetTokenHash');
    if (!user) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
    if (user.status !== 'active') throw new HttpError(403, 'Account disabled');

    user.password = password;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    // Sign out every device that had the old password.
    user.tokenVersion += 1;
    await user.save();
    res.json({ token: issueToken(user), user: publicUser(user) });
  })
);

router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(requireUser(req)) });
});

export default router;

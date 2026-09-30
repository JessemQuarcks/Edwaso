import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import Subscriber from '../models/Subscriber.js';
import { asyncHandler } from '../middleware/error.js';
import { emailSchema, parse } from '../middleware/validate.js';

const router = Router();

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

// Same answer whether or not the address was already on the list, so the form can't be used to
// check who has subscribed.
router.post(
  '/',
  limiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    await Subscriber.updateOne({ email }, { $setOnInsert: { email, source: 'footer' } }, { upsert: true });
    res.json({ message: 'Thanks for subscribing.' });
  })
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import Order from '../../models/Order.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';
import { asyncHandler } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { escapeRegex } from '../../lib/text.js';

// Backs the console's ⌘K palette: a few matches of each kind.
const router = Router();

const LIMIT = 5;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(100).catch('') }), req.query);
    if (q.length < 2) {
      res.json({ orders: [], products: [], customers: [] });
      return;
    }
    const pattern = escapeRegex(q.replace(/^#/, ''));
    const regex = { $regex: pattern, $options: 'i' };

    const customers = await User.find({ role: 'customer', $or: [{ name: regex }, { email: regex }] })
      .select('name email')
      .limit(LIMIT);
    const [orders, products] = await Promise.all([
      Order.find({
        status: { $ne: 'pending' },
        $or: [
          { user: { $in: customers.map((c) => c._id) } },
          { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: pattern, options: 'i' } } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(LIMIT)
        .select('total status createdAt user')
        .populate('user', 'name'),
      Product.find({ $or: [{ name: regex }, { sku: regex }] })
        .select('name sku image status price')
        .limit(LIMIT),
    ]);
    res.json({ orders, products, customers });
  })
);

export default router;

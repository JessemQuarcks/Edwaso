import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import { z } from 'zod';
import Order from '../../models/Order.js';
import User, { USER_STATUSES } from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { escapeRegex } from '../../lib/text.js';
import { COMPLETED } from './stats.js';

// Storefront customers. Staff accounts are managed on the team routes.
const router = Router();

const CUSTOMER_FIELDS = { name: 1, email: 1, status: 1, createdAt: 1 } as const;

/** Adds orders / spent / lastOrderAt from completed orders. */
const withOrderStats: PipelineStage[] = [
  {
    $lookup: {
      from: 'orders',
      let: { uid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$user', '$$uid'] }, status: { $in: COMPLETED } } },
        { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
      ],
      as: 'stats',
    },
  },
  {
    $addFields: {
      orders: { $ifNull: [{ $first: '$stats.orders' }, 0] },
      spent: { $ifNull: [{ $first: '$stats.spent' }, 0] },
      lastOrderAt: { $first: '$stats.lastOrderAt' },
    },
  },
  { $project: { stats: 0 } },
];

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(USER_STATUSES).optional().catch(undefined),
  sort: z.enum(['newest', 'spent', 'orders', 'name']).catch('newest'),
});

const SORTS = {
  newest: { createdAt: -1 },
  spent: { spent: -1, createdAt: -1 },
  orders: { orders: -1, createdAt: -1 },
  name: { name: 1 },
} as const;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, q, status, sort } = parse(listQuery, req.query);
    const match: Record<string, unknown> = { role: 'customer' };
    if (status) match.status = status;
    if (q) {
      const pattern = escapeRegex(q);
      match.$or = [{ name: { $regex: pattern, $options: 'i' } }, { email: { $regex: pattern, $options: 'i' } }];
    }

    const [result] = await User.aggregate<{ rows: unknown[]; total: { n: number }[] }>([
      { $match: match },
      { $project: CUSTOMER_FIELDS },
      ...withOrderStats,
      { $sort: SORTS[sort] },
      { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]);
    const total = result?.total[0]?.n ?? 0;
    res.json({ customers: result?.rows ?? [], page, pages: Math.max(1, Math.ceil(total / limit)), total });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' }).select(CUSTOMER_FIELDS);
    if (!customer) throw new HttpError(404, 'Customer not found');

    const [orders, [stats]] = await Promise.all([
      Order.find({ user: customer._id, status: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(50),
      Order.aggregate<{ orders: number; spent: number; units: number; firstOrderAt: Date; lastOrderAt: Date }>([
        { $match: { user: customer._id, status: { $in: COMPLETED } } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            spent: { $sum: '$total' },
            units: { $sum: { $sum: '$items.quantity' } },
            firstOrderAt: { $min: '$createdAt' },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]),
    ]);

    res.json({
      customer,
      stats: {
        orders: stats?.orders ?? 0,
        spent: stats?.spent ?? 0,
        units: stats?.units ?? 0,
        averageOrderValue: stats?.orders ? Math.round(stats.spent / stats.orders) : 0,
        firstOrderAt: stats?.firstOrderAt ?? null,
        lastOrderAt: stats?.lastOrderAt ?? null,
      },
      orders,
    });
  })
);

const statusSchema = z.object({ status: z.enum(USER_STATUSES, { error: 'Invalid status' }) });

// Disabling signs the customer out of the storefront immediately (tokenVersion bump).
router.patch(
  '/:id/status',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { status } = parse(statusSchema, req.body);
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) throw new HttpError(404, 'Customer not found');
    const before = customer.status;
    if (before !== status) {
      customer.status = status;
      if (status === 'disabled') customer.tokenVersion += 1;
      await customer.save();
      await audit(req, status === 'disabled' ? 'customer.disable' : 'customer.enable', {
        entity: 'User',
        entityId: customer.id,
        before: { status: before },
        after: { status },
      });
    }
    res.json({ customer: { _id: customer.id, name: customer.name, email: customer.email, status: customer.status } });
  })
);

export default router;

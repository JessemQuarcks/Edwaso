import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import Order, { ORDER_STATUSES, type IOrder, type OrderStatus } from '../../models/Order.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { escapeRegex, toCsv } from '../../lib/text.js';

const router = Router();

/**
 * Allowed manual status changes. `pending -> paid` is deliberately absent: only the Stripe
 * webhook may mark an order paid. Refunds still happen in the Stripe dashboard (roadmap 2e).
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  customer: z.string().regex(/^[a-f\d]{24}$/i).optional().catch(undefined),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).catch('newest'),
});

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  total_desc: { total: -1, createdAt: -1 },
  total_asc: { total: 1, createdAt: -1 },
} as const;

/**
 * Search matches the customer's name or email, or any part of the order id (admins read out the
 * short `#1A2B3C4D` form, which is the id's last 8 characters).
 */
async function searchFilter(q: string | undefined, customer: string | undefined): Promise<FilterQuery<IOrder>> {
  const filter: FilterQuery<IOrder> = {};
  if (customer) filter.user = customer;
  if (!q) return filter;
  const pattern = escapeRegex(q.replace(/^#/, ''));
  const users = await User.find({ $or: [{ name: { $regex: pattern, $options: 'i' } }, { email: { $regex: pattern, $options: 'i' } }] })
    .select('_id')
    .limit(500);
  filter.$or = [
    { user: { $in: users.map((u) => u._id) } },
    { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: pattern, options: 'i' } } },
  ];
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, status, q, customer, sort } = parse(listQuery, req.query);
    const base = await searchFilter(q, customer);
    const filter = status ? { ...base, status } : base;

    const [orders, total, counts] = await Promise.all([
      Order.find(filter)
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name email'),
      Order.countDocuments(filter),
      // Per-status counts for the tabs, under the same search.
      Order.aggregate<{ _id: OrderStatus; count: number }>([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const c of counts) byStatus[c._id] = c.count;
    res.json({
      orders,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      counts: { all: Object.values(byStatus).reduce((a, b) => a + b, 0), ...byStatus },
    });
  })
);

const EXPORT_LIMIT = 5000;

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { status, q, customer, sort } = parse(listQuery, req.query);
    const base = await searchFilter(q, customer);
    const orders = await Order.find(status ? { ...base, status } : base)
      .sort(SORTS[sort])
      .limit(EXPORT_LIMIT)
      .populate<{ user: { name: string; email: string } | null }>('user', 'name email');

    const rows = orders.map((o) => [
      o.id,
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? '',
      o.status,
      o.user?.name ?? '',
      o.user?.email ?? '',
      o.items.reduce((n, i) => n + i.quantity, 0),
      (o.total / 100).toFixed(2),
      o.shippingAddress?.country ?? '',
    ]);
    await audit(req, 'order.export', { meta: { count: rows.length, status, q } });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(['order_id', 'created_at', 'paid_at', 'status', 'customer', 'email', 'items', 'total', 'country'], rows));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email createdAt')
      .populate('statusHistory.by', 'name email');
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order, allowedTransitions: TRANSITIONS[order.status] });
  })
);

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Invalid status' }),
  note: z.string().trim().max(500).optional(),
  /** When cancelling a paid order, put its items back in stock. */
  restock: z.boolean().default(false),
});

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { status, note, restock } = parse(statusSchema, req.body);
    const before = await Order.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Order not found');
    if (!TRANSITIONS[before.status].includes(status)) {
      throw new HttpError(400, `A ${before.status} order can't be marked ${status}`);
    }

    // Conditional on the old status, so two admins acting at once can't both apply a change.
    const order = await Order.findOneAndUpdate(
      { _id: before._id, status: before.status },
      { status, $push: { statusHistory: { status, at: new Date(), by: user._id, note } } },
      { new: true }
    );
    if (!order) throw new HttpError(409, 'This order was just changed by someone else. Reload and try again.');

    // Stock is only decremented once payment lands, so only paid orders give it back.
    const restocked = restock && status === 'cancelled' && before.status === 'paid';
    if (restocked) {
      await Product.bulkWrite(
        order.items.map((i) => ({ updateOne: { filter: { _id: i.product }, update: { $inc: { stock: i.quantity } } } }))
      );
    }

    await audit(req, 'order.status', {
      entity: 'Order',
      entityId: order.id,
      before: { status: before.status },
      after: { status: order.status },
      meta: { note, restocked },
    });
    await order.populate([
      { path: 'user', select: 'name email createdAt' },
      { path: 'statusHistory.by', select: 'name email' },
    ]);
    res.json({ order, allowedTransitions: TRANSITIONS[order.status] });
  })
);

export default router;

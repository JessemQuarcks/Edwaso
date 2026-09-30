import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import Order, { ORDER_STATUSES, STOCK_TAKEN, type IOrder, type OrderDoc, type OrderStatus } from '../../models/Order.js';
import User from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin, requireRole } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { sendOrderShipped } from '../../lib/emails.js';
import { adjustForOrder } from '../../lib/inventory.js';
import { refundable, refundOrder } from '../../lib/payments.js';
import { escapeRegex, toCsv } from '../../lib/text.js';

const router = Router();

/**
 * Allowed manual status changes. `pending -> paid` is deliberately absent: only the Stripe
 * webhook may mark an order paid, and `refunded` is reached by refunding (see /refunds).
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled'],
  paid: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  customer: z.string().regex(/^[a-f\d]{24}$/i).optional().catch(undefined),
  from: z.coerce.date().optional().catch(undefined),
  to: z.coerce.date().optional().catch(undefined),
  /** Total bounds, in cents. */
  min: z.coerce.number().int().min(0).optional().catch(undefined),
  max: z.coerce.number().int().min(0).optional().catch(undefined),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).catch('newest'),
});

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  total_desc: { total: -1, createdAt: -1 },
  total_asc: { total: 1, createdAt: -1 },
} as const;

/**
 * Everything but the status: search matches the customer's name or email, or any part of the
 * order id (admins read out the short `#1A2B3C4D` form, the id's last 8 characters).
 */
async function baseFilter(q: z.output<typeof listQuery>): Promise<FilterQuery<IOrder>> {
  const filter: FilterQuery<IOrder> = {};
  if (q.customer) filter.user = q.customer;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.min !== undefined || q.max !== undefined) {
    filter.total = { ...(q.min !== undefined ? { $gte: q.min } : {}), ...(q.max !== undefined ? { $lte: q.max } : {}) };
  }
  if (q.q) {
    const pattern = escapeRegex(q.q.replace(/^#/, ''));
    const users = await User.find({ $or: [{ name: { $regex: pattern, $options: 'i' } }, { email: { $regex: pattern, $options: 'i' } }] })
      .select('_id')
      .limit(500);
    filter.$or = [
      { user: { $in: users.map((u) => u._id) } },
      { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: pattern, options: 'i' } } },
    ];
  }
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(listQuery, req.query);
    const { page, limit, status, sort } = query;
    const base = await baseFilter(query);
    const filter = status ? { ...base, status } : base;

    const [orders, total, counts] = await Promise.all([
      Order.find(filter)
        .select('-notes')
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name email'),
      Order.countDocuments(filter),
      // Per-status counts for the tabs, under the same search and filters.
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
    const query = parse(listQuery, req.query);
    const base = await baseFilter(query);
    const orders = await Order.find(query.status ? { ...base, status: query.status } : base)
      .sort(SORTS[query.sort])
      .limit(EXPORT_LIMIT)
      .populate<{ user: { name: string; email: string } | null }>('user', 'name email');

    const money = (c?: number) => (c === undefined ? '' : (c / 100).toFixed(2));
    const rows = orders.map((o) => [
      o.id,
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? '',
      o.status,
      o.user?.name ?? '',
      o.user?.email ?? '',
      o.items.reduce((n, i) => n + i.quantity, 0),
      o.currency,
      money(o.total),
      money(o.amountRefunded),
      money(o.payment?.fee),
      o.fulfillment?.carrier ?? '',
      o.fulfillment?.trackingNumber ?? '',
      o.shippingAddress?.country ?? '',
    ]);
    await audit(req, 'order.export', { meta: { count: rows.length, status: query.status, q: query.q } });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(
      toCsv(
        ['order_id', 'created_at', 'paid_at', 'status', 'customer', 'email', 'items', 'currency', 'total', 'refunded', 'stripe_fee', 'carrier', 'tracking_number', 'country'],
        rows
      )
    );
  })
);

async function loadDetail(id: string) {
  return Order.findById(id)
    .populate('user', 'name email createdAt')
    .populate('statusHistory.by', 'name email')
    .populate('notes.author', 'name email')
    .populate('refunds.by', 'name email');
}

const detail = (order: OrderDoc) => ({
  order,
  allowedTransitions: TRANSITIONS[order.status],
  refundable: order.payment?.paymentIntentId && !['pending', 'cancelled', 'refunded'].includes(order.status) ? refundable(order) : 0,
});

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await loadDetail(req.params.id!);
    if (!order) throw new HttpError(404, 'Order not found');
    res.json(detail(order));
  })
);

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { error: 'Invalid status' }),
  note: z.string().trim().max(500).optional(),
  // Shipping details.
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
  trackingUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Tracking URL must be an http(s) link' })]).optional(),
  /** Email the customer when the order ships. */
  notify: z.boolean().default(true),
  // Cancellation of a paid order.
  refund: z.boolean().default(false),
  restock: z.boolean().default(false),
});

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const input = parse(statusSchema, req.body);
    const before = await Order.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Order not found');
    if (!TRANSITIONS[before.status].includes(input.status)) {
      throw new HttpError(400, `A ${before.status} order can't be marked ${input.status}`);
    }

    // Refund first: if Stripe refuses, nothing else changes.
    let refunded = 0;
    if (input.status === 'cancelled' && input.refund && refundable(before) > 0) {
      refunded = refundable(before);
      await refundOrder(before, { amount: refunded, reason: 'requested_by_customer', note: input.note, by: user._id, keepStatus: true });
    }

    const now = new Date();
    const set: Record<string, unknown> = { status: input.status };
    if (input.status === 'shipped') {
      set['fulfillment.shippedAt'] = now;
      if (input.carrier) set['fulfillment.carrier'] = input.carrier;
      if (input.trackingNumber) set['fulfillment.trackingNumber'] = input.trackingNumber;
      if (input.trackingUrl) set['fulfillment.trackingUrl'] = input.trackingUrl;
    }
    if (input.status === 'delivered') set['fulfillment.deliveredAt'] = now;

    // Conditional on the old status, so two admins acting at once can't both apply a change.
    const order = await Order.findOneAndUpdate(
      { _id: before._id, status: before.status },
      { $set: set, $push: { statusHistory: { status: input.status, at: now, by: user._id, note: input.note } } },
      { new: true }
    );
    if (!order) throw new HttpError(409, 'This order was just changed by someone else. Reload and try again.');

    const restocked = input.restock && input.status === 'cancelled' && STOCK_TAKEN.includes(before.status);
    if (restocked) await adjustForOrder(order, 1, 'cancellation', user._id);

    let emailed = false;
    if (input.status === 'shipped' && input.notify) {
      const customer = await User.findById(order.user).select('name email');
      if (customer) emailed = (await sendOrderShipped(order, customer)).status !== 'failed';
    }

    await audit(req, 'order.status', {
      entity: 'Order',
      entityId: order.id,
      before: { status: before.status },
      after: { status: order.status },
      meta: { note: input.note, restocked, refunded, emailed, carrier: input.carrier, trackingNumber: input.trackingNumber },
    });
    res.json(detail((await loadDetail(order.id))!));
  })
);

// ---- Refunds ----

const refundSchema = z.object({
  /** Cents. */
  amount: z.number().int().min(1, 'Enter an amount to refund'),
  reason: z.enum(['requested_by_customer', 'duplicate', 'fraudulent', 'other']).default('requested_by_customer'),
  note: z.string().trim().max(500).optional(),
  /** Put the items back in stock; only for a refund of everything that's left. */
  restock: z.boolean().default(false),
});

router.post(
  '/:id/refunds',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const input = parse(refundSchema, req.body);
    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (['pending', 'cancelled', 'refunded'].includes(order.status)) {
      throw new HttpError(400, `A ${order.status} order can’t be refunded here`);
    }
    const full = input.amount === refundable(order);
    if (input.restock && !full) throw new HttpError(400, 'Restocking is only available when refunding the full remaining amount');

    const updated = await refundOrder(order, { ...input, by: user._id });
    if (input.restock) await adjustForOrder(updated, 1, 'return', user._id);
    await audit(req, 'order.refund', {
      entity: 'Order',
      entityId: order.id,
      meta: { amount: input.amount, reason: input.reason, note: input.note, restocked: input.restock },
    });
    res.status(201).json(detail((await loadDetail(order.id))!));
  })
);

// ---- Internal notes ----

const noteSchema = z.object({ body: z.string({ error: 'Write a note' }).trim().min(1, 'Write a note').max(2000) });

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { body } = parse(noteSchema, req.body);
    const order = await Order.findByIdAndUpdate(req.params.id, { $push: { notes: { body, author: user._id } } }, { new: true });
    if (!order) throw new HttpError(404, 'Order not found');
    await audit(req, 'order.note_add', { entity: 'Order', entityId: order.id });
    res.status(201).json(detail((await loadDetail(order.id))!));
  })
);

router.delete(
  '/:id/notes/:noteId',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const order = await Order.findById(req.params.id);
    const note = order?.notes.find((n) => n._id.toString() === req.params.noteId);
    if (!order || !note) throw new HttpError(404, 'Note not found');
    // Your own notes, or anyone's if you're an owner or admin.
    if (!note.author.equals(user._id) && user.role === 'staff') throw new HttpError(403, 'You can only delete your own notes');
    await Order.updateOne({ _id: order._id }, { $pull: { notes: { _id: note._id } } });
    await audit(req, 'order.note_delete', { entity: 'Order', entityId: order.id, before: { body: note.body } });
    res.json(detail((await loadDetail(order.id))!));
  })
);

export default router;

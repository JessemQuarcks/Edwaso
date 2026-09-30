import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import { z } from 'zod';
import Order, { SALE_STATUSES } from '../../models/Order.js';
import User, { USER_STATUSES } from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin, requireRole } from '../../middleware/adminSession.js';
import AuditLog from '../../models/AuditLog.js';
import CustomerNote from '../../models/CustomerNote.js';
import EmailLog from '../../models/EmailLog.js';
import { audit } from '../../lib/audit.js';
import { startPasswordReset } from '../../lib/password-reset.js';
import { escapeRegex, toCsv } from '../../lib/text.js';
import Subscriber from '../../models/Subscriber.js';

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
        { $match: { $expr: { $eq: ['$user', '$$uid'] }, status: { $in: SALE_STATUSES } } },
        { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: { $subtract: ['$total', { $ifNull: ['$amountRefunded', 0] }] } }, lastOrderAt: { $max: '$createdAt' } } },
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
        { $match: { user: customer._id, status: { $in: SALE_STATUSES } } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            spent: { $sum: { $subtract: ['$total', { $ifNull: ['$amountRefunded', 0] }] } },
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

const findCustomer = async (id: string) => {
  const customer = await User.findOne({ _id: id, role: 'customer' });
  if (!customer) throw new HttpError(404, 'Customer not found');
  return customer;
};

// Emails a one-time reset link. The link is never shown to staff: whoever can see it can take
// over the account.
router.post(
  '/:id/password-reset',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const customer = await findCustomer(req.params.id!);
    if (customer.status !== 'active') throw new HttpError(400, 'Re-enable the account before resetting its password');
    const log = await startPasswordReset(customer);
    await audit(req, 'customer.password_reset', { entity: 'User', entityId: customer.id, meta: { email: log.status } });
    res.json({ email: log.status });
  })
);

// ---- Newsletter subscribers (declared before /:id routes use the path) ----

router.get(
  '/subscribers/export',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 }).limit(100_000);
    await audit(req, 'subscribers.export', { meta: { count: subscribers.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(['email', 'subscribed_at', 'source'], subscribers.map((s) => [s.email, s.createdAt.toISOString(), s.source])));
  })
);

router.get(
  '/subscribers/count',
  asyncHandler(async (_req, res) => {
    res.json({ count: await Subscriber.countDocuments() });
  })
);

// ---- Notes ----

router.get(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const notes = await CustomerNote.find({ customer: req.params.id }).sort({ createdAt: -1 }).populate('author', 'name email');
    res.json({ notes });
  })
);

const noteSchema = z.object({ body: z.string({ error: 'Write a note' }).trim().min(1, 'Write a note').max(2000) });

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { body } = parse(noteSchema, req.body);
    const customer = await findCustomer(req.params.id!);
    const note = await CustomerNote.create({ customer: customer._id, author: user._id, body });
    await note.populate('author', 'name email');
    await audit(req, 'customer.note_add', { entity: 'User', entityId: customer.id });
    res.status(201).json({ note });
  })
);

router.delete(
  '/:id/notes/:noteId',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const note = await CustomerNote.findOne({ _id: req.params.noteId, customer: req.params.id });
    if (!note) throw new HttpError(404, 'Note not found');
    if (!note.author.equals(user._id) && user.role === 'staff') throw new HttpError(403, 'You can only delete your own notes');
    await note.deleteOne();
    await audit(req, 'customer.note_delete', { entity: 'User', entityId: req.params.id, before: { body: note.body } });
    res.status(204).end();
  })
);

// ---- Activity trail ----

interface ActivityEvent {
  at: Date;
  kind: 'account' | 'order' | 'email' | 'admin';
  title: string;
  detail?: string;
  orderId?: string;
  actor?: string;
  /** Money involved (refunds), in cents. */
  amount?: number;
}

const ORDER_EVENT: Record<string, string> = {
  pending: 'Placed an order',
  paid: 'Paid for order',
  processing: 'Order is being prepared',
  shipped: 'Order shipped',
  delivered: 'Order delivered',
  cancelled: 'Order cancelled',
  refunded: 'Order refunded',
};

const ADMIN_EVENT: Record<string, string> = {
  'customer.disable': 'Account disabled',
  'customer.enable': 'Account re-enabled',
  'customer.password_reset': 'Password reset email sent',
  'customer.note_add': 'Note added',
  'customer.note_delete': 'Note deleted',
};

/** Everything that happened to a customer: account, orders, emails and staff actions, newest first. */
router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const customer = await findCustomer(req.params.id!);
    const [orders, emails, actions] = await Promise.all([
      Order.find({ user: customer._id }).sort({ createdAt: -1 }).limit(50).select('createdAt statusHistory refunds total status'),
      EmailLog.find({ user: customer._id }).sort({ createdAt: -1 }).limit(50),
      AuditLog.find({ entity: 'User', entityId: customer.id }).sort({ createdAt: -1 }).limit(50),
    ]);

    const events: ActivityEvent[] = [{ at: customer.createdAt, kind: 'account', title: 'Created an account' }];
    for (const o of orders) {
      const orderId = o.id as string;
      events.push({ at: o.createdAt, kind: 'order', title: ORDER_EVENT.pending!, orderId });
      for (const h of o.statusHistory) {
        events.push({ at: h.at, kind: 'order', title: ORDER_EVENT[h.status] ?? h.status, detail: h.note, orderId });
      }
      for (const r of o.refunds) {
        events.push({ at: r.createdAt, kind: 'order', title: 'Refund issued', amount: r.amount, detail: r.reason, orderId });
      }
    }
    for (const e of emails) {
      events.push({ at: e.createdAt, kind: 'email', title: `Email: ${e.subject}`, detail: e.status === 'failed' ? 'Failed to send' : e.status === 'logged' ? 'Not sent: email isn’t set up' : undefined });
    }
    for (const a of actions) {
      events.push({ at: a.createdAt, kind: 'admin', title: ADMIN_EVENT[a.action] ?? a.action, actor: a.actorEmail });
    }
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    res.json({ events: events.slice(0, 150) });
  })
);

export default router;

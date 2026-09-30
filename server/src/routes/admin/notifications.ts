import { Router } from 'express';
import { z } from 'zod';
import { isValidObjectId } from 'mongoose';
import Notification, { NOTIFY_TOPICS, TOPIC_ROLES } from '../../models/Notification.js';
import Order from '../../models/Order.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';
import { asyncHandler } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { emailPrefs } from '../../lib/notify.js';
import { getSettings } from '../../lib/settings.js';

// The console's bell: what needs attention now (computed), plus a feed of events (orders,
// stock alerts, payment problems) with per-person read state. Also each person's email settings.
const router = Router();

const FEED_LIMIT = 20;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const lowStockFilter = { stock: { $lte: (await getSettings()).lowStockThreshold }, status: { $ne: 'archived' } };
    const visible = { roles: user.role };
    const [awaitingShipment, lowStock, lowStockCount, feed, unread] = await Promise.all([
      Order.countDocuments({ status: { $in: ['paid', 'processing'] } }),
      Product.find(lowStockFilter).sort({ stock: 1 }).limit(5).select('name stock'),
      Product.countDocuments(lowStockFilter),
      Notification.find(visible).sort({ createdAt: -1 }).limit(FEED_LIMIT).lean(),
      Notification.countDocuments({ ...visible, readBy: { $ne: user._id } }),
    ]);
    res.json({
      awaitingShipment,
      lowStock,
      lowStockCount,
      unread,
      feed: feed.map(({ readBy, roles: _roles, key: _key, ...n }) => ({
        ...n,
        read: readBy.some((id) => id.equals(user._id)),
      })),
    });
  })
);

const readSchema = z.object({ ids: z.array(z.string().refine(isValidObjectId, 'Invalid id')).max(100).optional() });

/** Marks the given notifications (or all visible ones) as read for the current person. */
router.post(
  '/read',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { ids } = parse(readSchema, req.body ?? {});
    await Notification.updateMany(
      { roles: user.role, readBy: { $ne: user._id }, ...(ids ? { _id: { $in: ids } } : {}) },
      { $addToSet: { readBy: user._id } }
    );
    res.status(204).end();
  })
);

// ---- Email preferences ----

const topicsFor = (role: Parameters<typeof emailPrefs>[0]['role']) => NOTIFY_TOPICS.filter((t) => TOPIC_ROLES[t].includes(role));

router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    res.json({ email: user.email, topics: topicsFor(user.role), preferences: emailPrefs(user) });
  })
);

const prefsSchema = z.object({
  orders: z.boolean().optional(),
  stock: z.boolean().optional(),
  payments: z.boolean().optional(),
});

router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const input = parse(prefsSchema, req.body);
    const before = emailPrefs(user);
    const allowed = topicsFor(user.role);
    const next = { ...before };
    for (const topic of allowed) if (input[topic] !== undefined) next[topic] = input[topic]!;
    // Store only topics this role can receive; the rest stay at their (off) default.
    const stored = Object.fromEntries(allowed.map((t) => [t, next[t]]));
    const updated = await User.findByIdAndUpdate(user._id, { notify: stored }, { new: true });
    await audit(req, 'notifications.preferences', { entity: 'User', entityId: user.id, before, after: emailPrefs(updated ?? user) });
    res.json({ email: user.email, topics: allowed, preferences: emailPrefs(updated ?? user) });
  })
);

export default router;

import { Router } from 'express';
import Order, { type OrderDoc } from '../models/Order.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { syncPendingOrder } from '../lib/checkout-sync.js';

// A customer's own orders. Order management lives under /api/admin/orders.
const router = Router();

/** Staff-only fields: internal notes, unit costs, Stripe fees, and who changed what and why. */
const PRIVATE_FIELDS = '-notes -items.costPrice -payment -refunds.by -refunds.reason -refunds.refundId -statusHistory.by -statusHistory.note -stripeSessionId';

/** Orders still on their way to the customer. */
const ACTIVE = ['paid', 'processing', 'shipped'];

/** Checked with Stripe per request; more than this and the rest wait for the next load. */
const MAX_SYNC = 5;

/**
 * Brings the customer's unpaid checkouts up to date with Stripe, in case the webhook hasn't
 * arrived. Returns the ones still open for payment, with Stripe's link to finish paying.
 * A Stripe problem never blocks the page: the order just stays as it was.
 */
async function syncPending(orders: OrderDoc[]): Promise<Map<string, string>> {
  const open = new Map<string, string>();
  for (const order of orders.slice(0, MAX_SYNC)) {
    try {
      const { checkoutUrl } = await syncPendingOrder(order);
      if (checkoutUrl) open.set(order.id, checkoutUrl);
    } catch (err) {
      console.warn(`[orders] couldn't check order ${order.id} with Stripe:`, (err as Error).message);
    }
  }
  return open;
}

router.use(protect);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const pending = await Order.find({ user: user._id, status: 'pending', stripeSessionId: { $exists: true } }).sort({ createdAt: -1 });
    const open = await syncPending(pending);

    // Unpaid checkouts are shown only while they can still be paid; abandoned ones (cancelled
    // without ever being paid) aren't orders from the customer's point of view.
    const orders = await Order.find({
      user: user._id,
      $or: [
        { status: { $nin: ['pending', 'cancelled'] } },
        { status: 'cancelled', paidAt: { $exists: true } },
        { _id: { $in: [...open.keys()] } },
      ],
    })
      .select(PRIVATE_FIELDS)
      .sort({ createdAt: -1 });
    res.json({ orders: orders.map((o) => ({ ...o.toJSON(), checkoutUrl: open.get(o.id) })) });
  })
);

/** For the storefront header: how many orders are on their way. */
router.get(
  '/mine/summary',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    res.json({ active: await Order.countDocuments({ user: user._id, status: { $in: ACTIVE } }) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const found = await Order.findById(req.params.id);
    if (!found || !found.user.equals(user._id)) throw new HttpError(404, 'Order not found');
    const open = found.status === 'pending' ? await syncPending([found]) : new Map<string, string>();
    const order = await Order.findById(found._id).select(PRIVATE_FIELDS);
    res.json({ order: { ...order!.toJSON(), checkoutUrl: open.get(found.id) } });
  })
);

export default router;

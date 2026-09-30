import { Router } from 'express';
import Order from '../models/Order.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

// A customer's own orders. Order management lives under /api/admin/orders.
const router = Router();

/** Staff-only fields: internal notes, unit costs, Stripe fees, and who changed what and why. */
const PRIVATE_FIELDS = '-notes -items.costPrice -payment -refunds.by -refunds.reason -statusHistory.by -statusHistory.note -stripeSessionId';

router.use(protect);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    // Pending orders are unpaid checkout attempts; hide them from the customer.
    const orders = await Order.find({ user: user._id, status: { $ne: 'pending' } })
      .select(PRIVATE_FIELDS)
      .sort({ createdAt: -1 });
    res.json({ orders });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const order = await Order.findById(req.params.id).select(PRIVATE_FIELDS);
    if (!order || !order.user.equals(user._id)) throw new HttpError(404, 'Order not found');
    res.json({ order });
  })
);

export default router;

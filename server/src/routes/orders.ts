import { Router } from 'express';
import Order, { type OrderStatus } from '../models/Order.js';
import { protect, adminOnly, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();

router.use(protect);

// 'pending' is system-managed (set at checkout, cleared by the webhook).
const ADMIN_SETTABLE: OrderStatus[] = ['paid', 'shipped', 'cancelled'];

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    // Pending orders are unpaid checkout attempts; hide them from the customer.
    const orders = await Order.find({ user: user._id, status: { $ne: 'pending' } }).sort({
      createdAt: -1,
    });
    res.json({ orders });
  })
);

router.get(
  '/',
  adminOnly,
  asyncHandler(async (_req, res) => {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('user', 'name email');
    res.json({ orders });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const order = await Order.findById(req.params.id);
    if (!order || (!user.isAdmin && !order.user.equals(user._id))) {
      throw new HttpError(404, 'Order not found');
    }
    res.json({ order });
  })
);

router.patch(
  '/:id/status',
  adminOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.body as Record<string, unknown>;
    if (!ADMIN_SETTABLE.includes(status as OrderStatus)) {
      throw new HttpError(400, 'Invalid status');
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: status as OrderStatus },
      { new: true }
    );
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order });
  })
);

export default router;

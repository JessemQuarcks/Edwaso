import { Router } from 'express';
import { z } from 'zod';
import Order from '../../models/Order.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();

// 'pending' is system-managed (set at checkout, cleared by the webhook).
const statusSchema = z.object({
  status: z.enum(['paid', 'shipped', 'cancelled'], { error: 'Invalid status' }),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(200).populate('user', 'name email');
    res.json({ orders });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order });
  })
);

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = parse(statusSchema, req.body);
    const before = await Order.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Order not found');
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) throw new HttpError(404, 'Order not found');
    await audit(req, 'order.status', {
      entity: 'Order',
      entityId: order.id,
      before: { status: before.status },
      after: { status: order.status },
    });
    res.json({ order });
  })
);

export default router;

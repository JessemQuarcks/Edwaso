import { Router } from 'express';
import { z } from 'zod';
import AuditLog from '../../models/AuditLog.js';
import Order from '../../models/Order.js';
import Product from '../../models/Product.js';
import { asyncHandler } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import {
  requireAdminSession,
  requireRole,
  requireSameOrigin,
  requireSetupComplete,
} from '../../middleware/adminSession.js';
import authRoutes from './auth.js';
import sessionRoutes from './sessions.js';
import { invitationRoutes, inviteRoutes } from './invites.js';
import productRoutes from './products.js';
import orderRoutes from './orders.js';
import customerRoutes from './customers.js';
import teamRoutes from './team.js';
import statsRoutes, { LOW_STOCK_THRESHOLD } from './stats.js';

// Everything under /api/admin. Authenticated only by the admin session cookie, never by a
// storefront token. Order matters: each `use` below guards every route registered after it.
const router = Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireSameOrigin);

// Public: login, and redeeming an invite link.
router.use('/auth', authRoutes); // /me, /password and /2fa/* check the session themselves
router.use('/invitations', invitationRoutes);

// Signed in, account setup possibly incomplete.
router.use(requireAdminSession);
router.use('/sessions', sessionRoutes);

// Signed in with password changed and 2FA enrolled.
router.use(requireSetupComplete);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/customers', customerRoutes);
router.use('/stats', statsRoutes);
router.use('/invites', requireRole('owner', 'admin'), inviteRoutes);
router.use('/team', requireRole('owner', 'admin'), teamRoutes);

// Polled by the console shell for the sidebar badge and the notifications menu.
router.get(
  '/notifications',
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [awaitingShipment, lowStock, lowStockCount, recentOrders] = await Promise.all([
      Order.countDocuments({ status: 'paid' }),
      Product.find({ stock: { $lte: LOW_STOCK_THRESHOLD } }).sort({ stock: 1 }).limit(5).select('name stock'),
      Product.countDocuments({ stock: { $lte: LOW_STOCK_THRESHOLD } }),
      Order.find({ status: { $in: ['paid', 'shipped'] }, paidAt: { $gte: since } })
        .sort({ paidAt: -1 })
        .limit(5)
        .select('total paidAt user')
        .populate('user', 'name'),
    ]);
    res.json({ awaitingShipment, lowStock, lowStockCount, recentOrders });
  })
);

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  action: z.string().trim().max(60).optional().catch(undefined),
});

router.get(
  '/audit',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { limit, action } = parse(auditQuery, req.query);
    const entries = await AuditLog.find(action ? { action } : {})
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ entries });
  })
);

export default router;

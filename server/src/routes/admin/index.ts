import { Router } from 'express';
import { z } from 'zod';
import AuditLog from '../../models/AuditLog.js';
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
router.use('/invites', requireRole('owner', 'admin'), inviteRoutes);

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

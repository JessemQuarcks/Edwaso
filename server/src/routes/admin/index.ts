import { Router } from 'express';
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
import statsRoutes from './stats.js';
import settingsRoutes from './settings.js';
import categoryRoutes from './categories.js';
import uploadRoutes from './uploads.js';
import financeRoutes from './finance.js';
import auditRoutes from './audit.js';
import searchRoutes from './search.js';
import notificationRoutes from './notifications.js';

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
router.use('/categories', categoryRoutes);
router.use('/uploads', uploadRoutes);
router.use('/settings', settingsRoutes);
router.use('/finance', requireRole('owner', 'admin'), financeRoutes);
router.use('/stats', statsRoutes);
router.use('/invites', requireRole('owner', 'admin'), inviteRoutes);
router.use('/team', requireRole('owner', 'admin'), teamRoutes);

// Polled by the console shell for the sidebar badge and the notifications menu.
router.use('/notifications', notificationRoutes);

router.use('/audit', requireRole('owner', 'admin'), auditRoutes);
router.use('/search', searchRoutes);

export default router;

import { Router } from 'express';
import AdminSession from '../../models/AdminSession.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { clearAdminCookie, requireAdmin, SESSION_IDLE_MS } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';

// The signed-in admin's own active sessions ("where you're signed in").
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { user, session: current } = requireAdmin(req);
    const idleCutoff = new Date(Date.now() - SESSION_IDLE_MS);
    const sessions = await AdminSession.find({
      user: user._id,
      expiresAt: { $gt: new Date() },
      lastSeenAt: { $gt: idleCutoff },
    }).sort({ lastSeenAt: -1 });

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: s.id === current.id,
      })),
    });
  })
);

// Sign out everywhere else.
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    const { user, session: current } = requireAdmin(req);
    const { deletedCount } = await AdminSession.deleteMany({ user: user._id, _id: { $ne: current._id } });
    await audit(req, 'session.revoke_others', { meta: { count: deletedCount } });
    res.json({ revoked: deletedCount });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { user, session: current } = requireAdmin(req);
    const session = await AdminSession.findOneAndDelete({ _id: req.params.id, user: user._id });
    if (!session) throw new HttpError(404, 'Session not found');
    await audit(req, 'session.revoke', { entity: 'AdminSession', entityId: session.id });
    if (session.id === current.id) clearAdminCookie(res);
    res.status(204).end();
  })
);

export default router;

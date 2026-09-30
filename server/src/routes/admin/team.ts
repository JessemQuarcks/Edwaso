import { Router } from 'express';
import { z } from 'zod';
import AdminSession from '../../models/AdminSession.js';
import User, { ADMIN_ROLES, USER_STATUSES, type Role, type UserDoc } from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin, SESSION_IDLE_MS } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';

// Staff accounts. Mounted for owners and admins.
const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const members = await User.find({ role: { $in: ADMIN_ROLES } })
      .select('name email role status totpEnabled lastLoginAt createdAt')
      .sort({ role: 1, name: 1 });
    res.json({ members });
  })
);

/** Who may manage whom. Owners are only ever changed from the CLI. */
const MANAGES: Partial<Record<Role, Role[]>> = {
  owner: ['admin', 'staff'],
  admin: ['staff'],
};

const updateSchema = z
  .object({
    role: z.enum(['admin', 'staff']).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((b) => b.role || b.status, 'Nothing to change');

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { user: actor } = requireAdmin(req);
    const change = parse(updateSchema, req.body);
    const member: UserDoc | null = await User.findOne({ _id: req.params.id, role: { $in: ADMIN_ROLES } });
    if (!member) throw new HttpError(404, 'Team member not found');
    if (member._id.equals(actor._id)) throw new HttpError(400, 'You can’t change your own account here');

    const allowed = MANAGES[actor.role] ?? [];
    if (!allowed.includes(member.role)) throw new HttpError(403, `You can’t manage ${member.role} accounts`);
    if (change.role && !allowed.includes(change.role)) throw new HttpError(403, `You can’t grant the ${change.role} role`);

    const before = { role: member.role, status: member.status };
    if (change.role) member.role = change.role;
    if (change.status) member.status = change.status;
    // Losing access ends every session at once; role changes apply on their next request anyway.
    if (change.status === 'disabled' && before.status !== 'disabled') {
      member.tokenVersion += 1;
      await AdminSession.deleteMany({ user: member._id });
    }
    await member.save();
    await audit(req, 'team.update', {
      entity: 'User',
      entityId: member.id,
      before,
      after: { role: member.role, status: member.status },
    });

    res.json({
      member: {
        _id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        totpEnabled: member.totpEnabled,
        lastLoginAt: member.lastLoginAt,
        createdAt: member.createdAt,
      },
    });
  })
);

/** A member the signed-in admin is allowed to manage (never themselves, never an owner). */
async function manageableMember(req: Parameters<typeof requireAdmin>[0], id: string): Promise<UserDoc> {
  const { user: actor } = requireAdmin(req);
  const member = await User.findOne({ _id: id, role: { $in: ADMIN_ROLES } });
  if (!member) throw new HttpError(404, 'Team member not found');
  if (member._id.equals(actor._id)) throw new HttpError(400, 'Manage your own sessions from Account & security');
  if (!(MANAGES[actor.role] ?? []).includes(member.role)) throw new HttpError(403, `You can’t manage ${member.role} accounts`);
  return member;
}

router.get(
  '/:id/sessions',
  asyncHandler(async (req, res) => {
    const member = await manageableMember(req, req.params.id!);
    const sessions = await AdminSession.find({
      user: member._id,
      expiresAt: { $gt: new Date() },
      lastSeenAt: { $gt: new Date(Date.now() - SESSION_IDLE_MS) },
    }).sort({ lastSeenAt: -1 });
    res.json({
      sessions: sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt })),
    });
  })
);

router.delete(
  '/:id/sessions',
  asyncHandler(async (req, res) => {
    const member = await manageableMember(req, req.params.id!);
    const { deletedCount } = await AdminSession.deleteMany({ user: member._id });
    await audit(req, 'team.sessions_revoke', { entity: 'User', entityId: member.id, meta: { count: deletedCount } });
    res.json({ revoked: deletedCount });
  })
);

export default router;

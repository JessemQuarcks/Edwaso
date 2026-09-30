import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import AdminInvite, { INVITE_ROLES, type InviteRole } from '../../models/AdminInvite.js';
import User, { ADMIN_MIN_PASSWORD, type Role } from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { emailSchema, parse, passwordSchema } from '../../middleware/validate.js';
import { pendingSteps, requireAdmin, startAdminSession } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { sendAdminInvite } from '../../lib/emails.js';
import { publicAdmin } from './auth.js';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** Which roles each inviter may hand out. `owner` is only ever created from the CLI. */
const CAN_INVITE: Partial<Record<Role, readonly InviteRole[]>> = {
  owner: INVITE_ROLES,
  admin: ['staff'],
};

const EMAIL_TAKEN =
  'An account already uses this email. Staff accounts need their own email address, separate from any shopping account.';

const openInvite = () => ({
  acceptedAt: { $exists: false },
  revokedAt: { $exists: false },
  expiresAt: { $gt: new Date() },
});

// ---- Management (owner/admin, mounted behind the admin session) ----

export const inviteRoutes = Router();

inviteRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const invites = await AdminInvite.find(openInvite())
      .sort({ createdAt: -1 })
      .populate('invitedBy', 'name email');
    res.json({ invites });
  })
);

const createSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITE_ROLES, { error: 'Choose a role' }),
});

inviteRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { email, role } = parse(createSchema, req.body);
    if (!CAN_INVITE[user.role]?.includes(role)) {
      throw new HttpError(403, `You cannot invite someone as ${role}`);
    }
    if (await User.exists({ email })) throw new HttpError(409, EMAIL_TAKEN);

    // Re-inviting replaces any outstanding link for the same email.
    await AdminInvite.updateMany({ email, ...openInvite() }, { revokedAt: new Date() });

    const token = randomToken();
    const invite = await AdminInvite.create({
      email,
      role,
      tokenHash: sha256(token),
      invitedBy: user._id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    const inviteUrl = `${process.env.CLIENT_URL}/admin/invite/${token}`;
    const mail = await sendAdminInvite({ email, role, inviterName: user.name, url: inviteUrl, expiresAt: invite.expiresAt });
    const emailed = mail.status === 'sent';
    await audit(req, 'invite.create', { entity: 'AdminInvite', entityId: invite.id, meta: { email, role, emailed } });

    // The link goes only to the invitee's inbox. If it couldn't be emailed (no provider set up,
    // or the send failed), it is returned once for the inviter to pass on. Only the hash is
    // stored, so it can't be recovered later.
    res.status(201).json({ invite, emailed, ...(emailed ? {} : { inviteUrl }) });
  })
);

inviteRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const invite = await AdminInvite.findOneAndUpdate(
      { _id: req.params.id, ...openInvite() },
      { revokedAt: new Date() },
      { new: true }
    );
    if (!invite) throw new HttpError(404, 'Invite not found');
    await audit(req, 'invite.revoke', { entity: 'AdminInvite', entityId: invite.id, meta: { email: invite.email } });
    res.status(204).end();
  })
);

// ---- Redemption (public: the token in the link is the credential) ----

export const invitationRoutes = Router();

invitationRoutes.use(
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
);

const findOpenByToken = (token: string) => AdminInvite.findOne({ tokenHash: sha256(token), ...openInvite() });

invitationRoutes.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const invite = await findOpenByToken(req.params.token ?? '');
    if (!invite) throw new HttpError(404, 'This invite link is invalid or has expired');
    res.json({ email: invite.email, role: invite.role, expiresAt: invite.expiresAt });
  })
);

const acceptSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(100),
  password: passwordSchema(ADMIN_MIN_PASSWORD),
});

invitationRoutes.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const { name, password } = parse(acceptSchema, req.body);

    // Claim the invite atomically so a link can only ever be redeemed once.
    const invite = await AdminInvite.findOneAndUpdate(
      { tokenHash: sha256(req.params.token ?? ''), ...openInvite() },
      { acceptedAt: new Date() },
      { new: true }
    );
    if (!invite) throw new HttpError(404, 'This invite link is invalid or has expired');

    // Never attach an admin role to an existing account: the inviter, not the email's owner,
    // chose this address, so doing so could hand the inviter someone else's account.
    let user;
    try {
      if (await User.exists({ email: invite.email })) throw new HttpError(409, EMAIL_TAKEN);
      user = await User.create({ name, email: invite.email, password, role: invite.role });
    } catch (err) {
      await AdminInvite.updateOne({ _id: invite._id }, { $unset: { acceptedAt: 1 } });
      throw err;
    }

    await startAdminSession(req, res, user);
    await audit(req, 'invite.accept', {
      actor: user,
      entity: 'AdminInvite',
      entityId: invite.id,
      meta: { role: invite.role },
    });
    res.status(201).json({ status: 'ok', user: publicAdmin(user), pendingSteps: pendingSteps(user) });
  })
);

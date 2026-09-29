import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';
import type { Role } from './User.js';

export type InviteRole = Extract<Role, 'staff' | 'admin'>;
export const INVITE_ROLES: readonly InviteRole[] = ['staff', 'admin'];

export interface IAdminInvite {
  email: string;
  role: InviteRole;
  /** SHA-256 of the one-time token in the invite link. */
  tokenHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminInviteDoc = HydratedDocument<IAdminInvite>;

const adminInviteSchema = new Schema<IAdminInvite>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: INVITE_ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model<IAdminInvite>('AdminInvite', adminInviteSchema);

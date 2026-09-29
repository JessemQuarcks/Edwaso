import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// Server-side admin console session. The browser only holds the random token in an
// httpOnly cookie; the database stores its SHA-256 hash, so a DB leak cannot be replayed.
export interface IAdminSession {
  user: Types.ObjectId;
  tokenHash: string;
  /** User.tokenVersion at creation; a mismatch means the session was revoked. */
  tokenVersion: number;
  ip?: string;
  userAgent?: string;
  lastSeenAt: Date;
  /** Absolute expiry. MongoDB's TTL monitor removes the document after this. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminSessionDoc = HydratedDocument<IAdminSession>;

const adminSessionSchema = new Schema<IAdminSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    tokenVersion: { type: Number, required: true },
    ip: String,
    userAgent: String,
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminSession>('AdminSession', adminSessionSchema);

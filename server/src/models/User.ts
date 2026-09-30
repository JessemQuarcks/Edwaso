import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['customer', 'staff', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may sign in to the admin console. */
export const ADMIN_ROLES: readonly Role[] = ['staff', 'admin', 'owner'];
export const isAdminRole = (role: Role): boolean => ADMIN_ROLES.includes(role);

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CUSTOMER_MIN_PASSWORD = 8;
export const ADMIN_MIN_PASSWORD = 12;

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: Role;
  status: UserStatus;
  /** Bumped to revoke every token and session issued before the change. */
  tokenVersion: number;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  mustChangePassword: boolean;
  // Admin console lockout (see routes/admin/auth.ts).
  failedLoginAttempts: number;
  lockUntil?: Date;
  // TOTP two-factor auth. The secret is AES-GCM encrypted (lib/crypto.ts).
  totpSecret?: string;
  totpEnabled: boolean;
  /** Last accepted TOTP time step, so a code cannot be replayed. */
  totpLastStep?: number;
  /** SHA-256 hashes of unused recovery codes. */
  recoveryCodes: string[];
  // One-time password reset (storefront accounts). Only the hash is stored.
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  matchPassword(candidate: string): Promise<boolean>;
}

export type UserDoc = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: CUSTOMER_MIN_PASSWORD, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    mustChangePassword: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    totpSecret: { type: String, select: false },
    totpEnabled: { type: Boolean, default: false },
    totpLastStep: Number,
    recoveryCodes: { type: [String], default: [], select: false },
    resetTokenHash: { type: String, select: false, index: { sparse: true } },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.method('matchPassword', function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
});

export default mongoose.model<IUser, UserModel>('User', userSchema);

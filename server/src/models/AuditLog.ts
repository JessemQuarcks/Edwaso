import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

// Append-only record of admin console activity. Nothing in the API updates or deletes these.
export interface IAuditLog {
  actor?: Types.ObjectId;
  /** Denormalised so the entry stays readable if the user is later deleted. */
  actorEmail?: string;
  /** Dotted verb, e.g. `product.update`, `auth.login_failed`. */
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

export type AuditLogDoc = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: String,
    action: { type: String, required: true, index: true },
    entity: String,
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    meta: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

import type { Request } from 'express';
import AuditLog from '../models/AuditLog.js';
import type { UserDoc } from '../models/User.js';

interface AuditEntry {
  /** Defaults to the signed-in admin (`req.admin`). */
  actor?: UserDoc | null;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Records an admin action. A failure to write the log is reported but never fails the
 * request: by the time we audit, the action itself has already happened.
 */
export async function audit(req: Request, action: string, entry: AuditEntry = {}): Promise<void> {
  const actor = entry.actor === undefined ? req.admin?.user : entry.actor;
  try {
    await AuditLog.create({
      actor: actor?._id,
      actorEmail: actor?.email,
      action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      meta: entry.meta,
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    console.error(`Failed to write audit log for ${action}:`, err);
  }
}

/** Plain-object snapshot of a document for before/after diffs. */
export const snapshot = (doc: { toObject(): object } | null): unknown =>
  doc ? JSON.parse(JSON.stringify(doc.toObject())) : undefined;

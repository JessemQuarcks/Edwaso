import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import AuditLog, { type IAuditLog } from '../../models/AuditLog.js';
import { asyncHandler } from '../../middleware/error.js';
import { objectIdSchema, parse } from '../../middleware/validate.js';
import { escapeRegex, toCsv } from '../../lib/text.js';

// Read-only view of the audit log. Nothing in the API can edit or delete entries.
const router = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  /** Exact action, or a prefix ending in "." (e.g. `order.`). */
  action: z.string().trim().max(60).optional().catch(undefined),
  actor: objectIdSchema.optional().catch(undefined),
  /** Matches the actor's email. */
  q: z.string().trim().max(100).optional().catch(undefined),
  entity: z.string().trim().max(40).optional().catch(undefined),
  entityId: z.string().trim().max(40).optional().catch(undefined),
  from: z.coerce.date().optional().catch(undefined),
  to: z.coerce.date().optional().catch(undefined),
});

function filterFor(q: z.output<typeof listQuery>): FilterQuery<IAuditLog> {
  const filter: FilterQuery<IAuditLog> = {};
  if (q.action) filter.action = q.action.endsWith('.') ? { $regex: `^${escapeRegex(q.action)}` } : q.action;
  if (q.actor) filter.actor = q.actor;
  if (q.q) filter.actorEmail = { $regex: escapeRegex(q.q), $options: 'i' };
  if (q.entity) filter.entity = q.entity;
  if (q.entityId) filter.entityId = q.entityId;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parse(listQuery, req.query);
    const filter = filterFor(q);
    const [entries, total, actions] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action'),
    ]);
    res.json({ entries, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)), total, actions: (actions as string[]).sort() });
  })
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const q = parse(listQuery, req.query);
    const entries = await AuditLog.find(filterFor(q)).sort({ createdAt: -1 }).limit(20_000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(
      toCsv(
        ['time', 'actor', 'action', 'entity', 'entity_id', 'ip', 'before', 'after', 'meta'],
        entries.map((e) => [
          e.createdAt.toISOString(),
          e.actorEmail ?? '',
          e.action,
          e.entity ?? '',
          e.entityId ?? '',
          e.ip ?? '',
          e.before === undefined ? '' : JSON.stringify(e.before),
          e.after === undefined ? '' : JSON.stringify(e.after),
          e.meta === undefined ? '' : JSON.stringify(e.meta),
        ])
      )
    );
  })
);

export default router;

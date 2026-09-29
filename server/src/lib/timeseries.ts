import { z } from 'zod';

// Time-bucketed reporting. The browser computes the calendar-aligned range (it knows the
// admin's local midnight and month starts) and sends it with its IANA timezone; the server
// buckets in that timezone so "today" means the admin's today.

export const UNITS = ['hour', 'day', 'month'] as const;
export type Unit = (typeof UNITS)[number];

/** Upper bound on the span per unit, which also caps the number of buckets. */
const MAX_SPAN_MS: Record<Unit, number> = {
  hour: 72 * 3_600_000,
  day: 400 * 86_400_000,
  month: 20 * 366 * 86_400_000,
};

/** `$dateToString` formats; `bucketKey` below must produce identical strings. */
export const MONGO_FORMAT: Record<Unit, string> = {
  hour: '%Y-%m-%dT%H',
  day: '%Y-%m-%d',
  month: '%Y-%m',
};

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const rangeQuerySchema = z
  .object({
    from: z.coerce.date({ error: 'from must be a date' }).optional(),
    to: z.coerce.date({ error: 'to must be a date' }).optional(),
    /** Start of the comparison period, for calendar-aligned periods (e.g. the same months last year). */
    compareFrom: z.coerce.date().optional(),
    unit: z.enum(UNITS).default('day'),
    tz: z.string().max(64).refine(isTimeZone, 'Unknown timezone').default('UTC'),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, 'from must be before to');

export type RangeQuery = z.output<typeof rangeQuerySchema>;

export interface Range {
  from: Date;
  to: Date;
  unit: Unit;
  tz: string;
  /** Absent for "all time". */
  previous?: { from: Date; to: Date };
}

/**
 * Resolves the query into a concrete range. Without `from` (the "max" preset) the range starts
 * at `earliest` and has no previous period to compare against.
 */
export function resolveRange(q: RangeQuery, earliest: Date | null): Range {
  const to = q.to ?? new Date();
  const from = q.from ?? earliest ?? new Date(to.getTime() - 30 * 86_400_000);
  if (to.getTime() - from.getTime() > MAX_SPAN_MS[q.unit]) {
    throw new RangeError(`Range too long for ${q.unit} buckets`);
  }
  // The previous period covers the same length of time, so a half-finished "today" is compared
  // with the same slice of the matching day, not a whole one.
  const span = to.getTime() - from.getTime();
  const prevFrom = q.compareFrom ?? new Date(from.getTime() - span);
  const previous = q.from ? { from: prevFrom, to: new Date(prevFrom.getTime() + span) } : undefined;
  return { from, to, unit: q.unit, tz: q.tz, previous };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The bucket a timestamp falls in, in the same format as MONGO_FORMAT. */
export function bucketKey(date: Date, unit: Unit, tz: string): string {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  if (unit === 'month') return `${p.year}-${p.month}`;
  if (unit === 'day') return `${p.year}-${p.month}-${p.day}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

export interface Bucket {
  key: string;
  /** First instant of the range that falls in this bucket. */
  start: Date;
}

/**
 * Every bucket in [from, to), in order. Walks in steps small enough never to skip a bucket
 * (hours for hour/day units, days for months), so DST changes can't drop or merge one.
 */
export function buckets(from: Date, to: Date, unit: Unit, tz: string): Bucket[] {
  const step = unit === 'month' ? 86_400_000 : 3_600_000;
  const out: Bucket[] = [];
  let last = '';
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const key = bucketKey(new Date(t), unit, tz);
    if (key !== last) {
      out.push({ key, start: new Date(t) });
      last = key;
    }
  }
  return out;
}

/** Percentage change, or null when there is no baseline to compare with. */
export const percentChange = (current: number, previous: number | undefined): number | null =>
  previous === undefined || previous === 0 ? null : ((current - previous) / previous) * 100;

import type { RangeUnit } from '@/types/admin';

// Date-range presets for the dashboard. Calendar math happens here, in the admin's own timezone,
// and the API buckets in that same timezone (see server/src/lib/timeseries.ts).

export const RANGE_PRESETS = [
  { id: '24h', label: '24h', long: 'Last 24 hours', previous: 'previous 24 hours' },
  { id: '7d', label: '7d', long: 'Last 7 days', previous: 'previous 7 days' },
  { id: '30d', label: '30d', long: 'Last 30 days', previous: 'previous 30 days' },
  { id: '12m', label: '12m', long: 'Last 12 months', previous: 'previous 12 months' },
  { id: 'all', label: 'All', long: 'All time', previous: null },
] as const;

export type RangeId = (typeof RANGE_PRESETS)[number]['id'];
export const DEFAULT_RANGE: RangeId = '30d';

export const isRangeId = (value: string | null): value is RangeId =>
  RANGE_PRESETS.some((p) => p.id === value);

export const presetFor = (id: RangeId) => RANGE_PRESETS.find((p) => p.id === id)!;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Query string for /stats/overview and /stats/analytics. */
export function rangeQuery(id: RangeId, now = new Date()): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let from: Date | undefined;
  let compareFrom: Date | undefined;
  let unit: RangeUnit;

  switch (id) {
    case '24h': {
      unit = 'hour';
      from = new Date(now);
      from.setMinutes(0, 0, 0);
      from.setHours(from.getHours() - 23);
      compareFrom = new Date(from.getTime() - 24 * 3_600_000);
      break;
    }
    case '7d':
    case '30d': {
      unit = 'day';
      const days = id === '7d' ? 7 : 30;
      from = startOfDay(now);
      from.setDate(from.getDate() - (days - 1));
      compareFrom = new Date(from);
      compareFrom.setDate(compareFrom.getDate() - days);
      break;
    }
    case '12m': {
      unit = 'month';
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      compareFrom = new Date(now.getFullYear(), now.getMonth() - 23, 1);
      break;
    }
    case 'all':
      unit = 'month';
      break;
  }

  const params = new URLSearchParams({ unit, tz, to: now.toISOString() });
  if (from) params.set('from', from.toISOString());
  if (compareFrom) params.set('compareFrom', compareFrom.toISOString());
  return params.toString();
}

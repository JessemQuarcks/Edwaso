import type { RangeUnit } from '@/types/admin';

export { formatPrice } from './api';

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** $1.2K-style, for axis ticks and tight spaces. Takes cents. */
export const formatCompactPrice = (cents: number): string => compactCurrency.format(cents / 100);

const integer = new Intl.NumberFormat('en-US');
export const formatNumber = (n: number): string => integer.format(n);

/** Signed percentage for deltas: +12.5%, −3%. Uses a real minus sign. */
export function formatChange(change: number): string {
  const rounded = Math.abs(change) >= 10 ? Math.round(change) : Math.round(change * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

/** Short customer-facing order number: the id's last 8 characters. */
export const orderNumber = (id: string): string => `#${id.slice(-8).toUpperCase()}`;

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 hours ago", "yesterday". */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  for (const [unit, ms] of STEPS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** Axis tick for a bucket. */
export function bucketTick(iso: string, unit: RangeUnit, spansYears = false): string {
  const d = new Date(iso);
  if (unit === 'hour') return d.toLocaleTimeString(undefined, { hour: 'numeric' });
  if (unit === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' });
}

/** Full label for a bucket, used in tooltips and table views. */
export function bucketLabel(iso: string, unit: RangeUnit): string {
  const d = new Date(iso);
  if (unit === 'hour') return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (unit === 'day') return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

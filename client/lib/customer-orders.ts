import type { Order, OrderStatus } from '@/types';

// Shared wording and grouping for the customer's orders pages.

export const ACTIVE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped'];
export const CLOSED_STATUSES: OrderStatus[] = ['cancelled', 'refunded'];

export type OrderGroup = 'awaiting' | 'active' | 'delivered' | 'closed';

export function groupOf(o: Order): OrderGroup {
  if (o.status === 'pending') return 'awaiting';
  if (ACTIVE_STATUSES.includes(o.status)) return 'active';
  if (o.status === 'delivered') return 'delivered';
  return 'closed';
}

export const orderNumber = (id: string) => `#${id.slice(-8).toUpperCase()}`;

export const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);

/** When the order reached a status, from its history. */
export const reachedAt = (o: Order, status: OrderStatus) => o.statusHistory?.find((h) => h.status === status)?.at;

export const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

export const longDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** One line on where the order is, in the customer's terms. */
export function statusLine(o: Order): string {
  const f = o.fulfillment;
  switch (o.status) {
    case 'pending':
      return 'Payment not finished. Your items aren’t reserved until you pay.';
    case 'paid':
      return `Confirmed ${shortDate(o.paidAt ?? reachedAt(o, 'paid'))}. We’ll email you when it ships.`;
    case 'processing':
      return 'We’re packing your order now.';
    case 'shipped':
      return `On its way${f?.carrier ? ` with ${f.carrier}` : ''} since ${shortDate(f?.shippedAt ?? reachedAt(o, 'shipped'))}.`;
    case 'delivered':
      return `Delivered ${longDate(f?.deliveredAt ?? reachedAt(o, 'delivered'))}.`;
    case 'cancelled':
      return o.amountRefunded ? 'Cancelled and refunded.' : 'Cancelled.';
    case 'refunded':
      return 'Refunded in full.';
  }
}

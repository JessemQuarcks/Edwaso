import type Stripe from 'stripe';
import Order, { SALE_STATUSES, type IShippingAddress, type OrderDoc } from '../models/Order.js';
import { getStripe } from '../config/stripe.js';
import { adjustForOrder } from './inventory.js';
import { orderPaid } from './notify.js';
import { recordPayment } from './payments.js';

// Turning a Stripe Checkout Session into order state. Used by the webhook and, as a fallback,
// when the customer returns from Stripe or opens their orders: if the webhook is late or can't
// reach the API (common in local development), the order still becomes paid. Every step is
// idempotent, so the webhook and the fallback can both run for the same session.

// Stripe has moved shipping details between fields across API versions, so read both
// shapes structurally instead of depending on one version of the generated types.
interface ShippingInfo {
  name?: string | null;
  address?: Stripe.Address | null;
}
interface SessionWithShipping {
  shipping_details?: ShippingInfo | null;
  collected_information?: { shipping_details?: ShippingInfo | null } | null;
}

function toShippingAddress(ship: ShippingInfo): IShippingAddress | undefined {
  if (!ship.address) return undefined;
  const { address } = ship;
  return {
    name: ship.name ?? undefined,
    line1: address.line1 ?? undefined,
    line2: address.line2 ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    postalCode: address.postal_code ?? undefined,
    country: address.country ?? undefined,
  };
}

/** A completed, paid Checkout Session: mark the order paid, take the stock, record the payment. */
export async function handlePaid(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== 'paid') return;

  const s = session as Stripe.Checkout.Session & SessionWithShipping;
  const ship = s.shipping_details ?? s.collected_information?.shipping_details;

  const now = new Date();
  const update: Record<string, unknown> = {
    status: 'paid',
    paidAt: now,
    $push: { statusHistory: { status: 'paid', at: now, note: 'Payment received' } },
  };
  const shippingAddress = ship ? toShippingAddress(ship) : undefined;
  if (shippingAddress) update.shippingAddress = shippingAddress;

  // Three idempotent steps, so a retry after a failure part-way still completes the rest:
  // 1. pending -> paid and take the stock (the status filter makes this happen once);
  const order = await Order.findOneAndUpdate({ _id: session.metadata?.orderId, status: 'pending' }, update, { new: true });
  if (order) await adjustForOrder(order, -1, 'sale');

  // 2. record the payment and Stripe's fee, unless already done;
  const current = order ?? (await Order.findById(session.metadata?.orderId));
  if (current && !current.payment?.paymentIntentId) await recordPayment(current, session);

  // 3. confirmation email and staff notification (each deduplicated, so redeliveries are harmless).
  if (current && SALE_STATUSES.includes(current.status)) await orderPaid(current);
}

/** An abandoned checkout: the unpaid order is cancelled. */
export async function handleExpired(orderId: string | undefined): Promise<void> {
  if (!orderId) return;
  await Order.updateOne(
    { _id: orderId, status: 'pending' },
    { status: 'cancelled', $push: { statusHistory: { status: 'cancelled', at: new Date(), note: 'Checkout expired' } } }
  );
}

export interface SyncResult {
  order: OrderDoc;
  /** Stripe's page to finish paying, while the checkout is still open. */
  checkoutUrl?: string;
}

/**
 * Asks Stripe about a pending order's checkout and applies the answer. Orders that aren't
 * pending, or have no session, are returned untouched.
 */
export async function syncPendingOrder(order: OrderDoc): Promise<SyncResult> {
  if (order.status !== 'pending' || !order.stripeSessionId) return { order };
  const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
  if (session.metadata?.orderId !== order.id) return { order }; // not this order's session: ignore

  if (session.payment_status === 'paid') {
    await handlePaid(session);
  } else if (session.status === 'expired') {
    await handleExpired(order.id);
  } else if (session.status === 'open' && session.url) {
    return { order, checkoutUrl: session.url };
  }
  return { order: (await Order.findById(order._id)) ?? order };
}

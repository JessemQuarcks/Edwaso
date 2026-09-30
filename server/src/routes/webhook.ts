import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import Order, { type IShippingAddress } from '../models/Order.js';
import { adjustForOrder } from '../lib/inventory.js';
import { recordPayment, syncRefunds } from '../lib/payments.js';
import { getStripe } from '../config/stripe.js';

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

// Mounted with express.raw() in index.ts: Stripe signature verification needs the exact raw body.
export const stripeWebhook: RequestHandler = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (typeof signature !== 'string' || !secret) {
    res.status(400).send('Missing signature or webhook secret');
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handlePaid(event.data.object);
    } else if (event.type === 'charge.refunded') {
      await syncRefunds(event.data.object);
    } else if (event.type === 'checkout.session.expired') {
      await Order.updateOne(
        { _id: event.data.object.metadata?.orderId, status: 'pending' },
        { status: 'cancelled', $push: { statusHistory: { status: 'cancelled', at: new Date(), note: 'Checkout expired' } } }
      );
    }
    res.json({ received: true });
  } catch (err) {
    // A non-2xx response makes Stripe retry the event.
    console.error('Webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
};

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

async function handlePaid(session: Stripe.Checkout.Session): Promise<void> {
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

  // Two idempotent steps, so a retry after a failure part-way still completes the second:
  // 1. pending -> paid and take the stock (the status filter makes this happen once);
  const order = await Order.findOneAndUpdate(
    { _id: session.metadata?.orderId, status: 'pending' },
    update,
    { new: true }
  );
  if (order) await adjustForOrder(order, -1, 'sale');

  // 2. record the payment and Stripe's fee, unless already done.
  const current = order ?? (await Order.findById(session.metadata?.orderId));
  if (current && !current.payment?.paymentIntentId) await recordPayment(current, session);
}

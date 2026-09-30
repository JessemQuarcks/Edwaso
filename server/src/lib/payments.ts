import type Stripe from 'stripe';
import type { Types } from 'mongoose';
import Order, { SALE_STATUSES, type OrderDoc } from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import { getStripe } from '../config/stripe.js';
import { HttpError } from '../middleware/error.js';

// Money movements for an order: recording the payment (with Stripe's fee) and refunds.
// Every write is keyed by a Stripe id, so a retried webhook or a double click can't
// count anything twice.

const idOf = (value: string | { id: string } | null | undefined): string | undefined =>
  typeof value === 'string' ? value : (value?.id ?? undefined);

/**
 * Fills order.payment from the Checkout Session and its payment intent, and adds the payment to
 * the ledger. Safe to call repeatedly.
 */
export async function recordPayment(order: OrderDoc, session: Stripe.Checkout.Session): Promise<void> {
  const paymentIntentId = idOf(session.payment_intent);
  if (!paymentIntentId) return;

  // The fee lives on the charge's balance transaction.
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
  const amount = intent.amount_received || session.amount_total || order.total;
  const fee = balance?.fee ?? 0;

  order.payment = {
    paymentIntentId,
    chargeId: charge?.id,
    amountSubtotal: session.amount_subtotal ?? undefined,
    amountTax: session.total_details?.amount_tax ?? undefined,
    amountShipping: session.total_details?.amount_shipping ?? undefined,
    amountTotal: amount,
    fee,
    net: balance?.net ?? amount - fee,
  };
  await order.save();

  await Transaction.updateOne(
    { stripeId: paymentIntentId },
    {
      $setOnInsert: {
        type: 'payment',
        order: order._id,
        stripeId: paymentIntentId,
        chargeId: charge?.id,
        balanceTransactionId: balance?.id,
        currency: intent.currency,
        amount,
        fee,
        net: balance?.net ?? amount - fee,
        occurredAt: order.paidAt ?? new Date(),
        description: `Payment for order ${order.id}`,
      },
    },
    { upsert: true }
  );
}

/** Amount still refundable on an order. */
export const refundable = (order: OrderDoc): number => Math.max(0, order.total - (order.amountRefunded ?? 0));

/**
 * Records a Stripe refund on the order and in the ledger, once. A full refund of a sale moves the
 * order to `refunded`, unless `keepStatus` (used when the refund is part of a cancellation).
 */
export async function applyRefund(
  orderId: Types.ObjectId,
  refund: Pick<Stripe.Refund, 'id' | 'amount' | 'status' | 'reason' | 'created' | 'currency'> & {
    balance_transaction?: string | Stripe.BalanceTransaction | null;
  },
  options: { by?: Types.ObjectId; note?: string; keepStatus?: boolean } = {}
): Promise<OrderDoc | null> {
  if (refund.status === 'failed' || refund.status === 'canceled') return Order.findById(orderId);
  const at = new Date(refund.created * 1000);

  // Conditional on the refund not being recorded yet: a concurrent webhook and API call can't both add it.
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'refunds.refundId': { $ne: refund.id } },
    {
      $inc: { amountRefunded: refund.amount },
      $push: {
        refunds: {
          refundId: refund.id,
          amount: refund.amount,
          reason: options.note ?? refund.reason ?? undefined,
          status: refund.status ?? 'pending',
          createdAt: at,
          by: options.by,
        },
      },
    },
    { new: true }
  );
  if (!order) return Order.findById(orderId); // already recorded

  const balanceId = idOf(refund.balance_transaction as string | { id: string } | null | undefined);
  await Transaction.updateOne(
    { stripeId: refund.id },
    {
      $setOnInsert: {
        type: 'refund',
        order: order._id,
        stripeId: refund.id,
        balanceTransactionId: balanceId,
        currency: refund.currency,
        amount: -refund.amount,
        fee: 0,
        net: -refund.amount,
        occurredAt: at,
        description: `Refund for order ${order.id}`,
      },
    },
    { upsert: true }
  );

  if (!options.keepStatus && order.amountRefunded >= order.total && SALE_STATUSES.includes(order.status)) {
    order.status = 'refunded';
    order.statusHistory.push({ status: 'refunded', at, by: options.by, note: options.note });
    await order.save();
  }
  return order;
}

const STRIPE_REASONS = ['duplicate', 'fraudulent', 'requested_by_customer'] as const;
export type RefundReason = (typeof STRIPE_REASONS)[number] | 'other';

/** Refunds part or all of an order through Stripe, then records it. */
export async function refundOrder(
  order: OrderDoc,
  input: { amount: number; reason: RefundReason; note?: string; by?: Types.ObjectId; keepStatus?: boolean }
): Promise<OrderDoc> {
  const paymentIntentId = order.payment?.paymentIntentId;
  if (!paymentIntentId) {
    throw new HttpError(
      400,
      'This order has no recorded Stripe payment, so it can’t be refunded from here. Refund it in your Stripe dashboard.'
    );
  }
  const max = refundable(order);
  if (input.amount < 1) throw new HttpError(400, 'Enter an amount to refund');
  if (input.amount > max) throw new HttpError(400, `At most ${(max / 100).toFixed(2)} can still be refunded`);

  let refund: Stripe.Refund;
  try {
    refund = await getStripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: input.amount,
        ...(input.reason !== 'other' ? { reason: input.reason } : {}),
        metadata: { orderId: order.id, ...(input.by ? { adminId: input.by.toString() } : {}) },
      },
      // Same order, same amount, same already-refunded total => same request; a double click
      // or retry can't refund twice.
      { idempotencyKey: `refund-${order.id}-${order.amountRefunded}-${input.amount}` }
    );
  } catch (err) {
    const message = (err as { message?: string }).message ?? 'Stripe declined the refund';
    throw new HttpError(502, `Stripe: ${message}`);
  }

  const updated = await applyRefund(order._id, refund, { by: input.by, note: input.note, keepStatus: input.keepStatus });
  if (!updated) throw new HttpError(404, 'Order not found');
  return updated;
}

/** For `charge.refunded` webhooks: records refunds made outside the admin (e.g. the Stripe dashboard). */
export async function syncRefunds(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) return;
  const order = await Order.findOne({ 'payment.paymentIntentId': paymentIntentId });
  if (!order) return;
  const refunds = await getStripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  for (const refund of refunds.data) await applyRefund(order._id, refund);
}

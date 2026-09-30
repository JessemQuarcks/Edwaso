import type { Types } from 'mongoose';
import Notification, { TOPIC_OF, TOPIC_ROLES, type NotificationDoc, type NotificationType, type NotifyTopic } from '../models/Notification.js';
import EmailLog from '../models/EmailLog.js';
import User, { type NotifyPrefs, type Role } from '../models/User.js';
import type { OrderDoc } from '../models/Order.js';
import { sendOrderConfirmation, sendRefundOrCancellation, sendStaffAlert } from './emails.js';
import { getSettings } from './settings.js';
import { formatMoney, orderNumber } from './text.js';

// Admin notifications (the console feed plus opt-in staff emails) and the customer emails that
// follow order events. Nothing here throws: a notification problem is logged and never undoes
// the payment, refund or stock change that triggered it.

/** Email defaults when someone hasn't chosen: owners and admins hear about stock and payment problems. */
export function emailPrefs(user: { role: Role; notify?: NotifyPrefs | null }): Required<NotifyPrefs> {
  const lead = user.role === 'owner' || user.role === 'admin';
  const p = user.notify ?? {};
  return {
    orders: p.orders ?? false,
    stock: p.stock ?? lead,
    payments: lead && (p.payments ?? true),
  };
}

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[notify] ${label} failed:`, err);
    return null;
  }
}

/** Records a console notification (once per `key`) and emails the staff who asked for its topic. */
export function notify(input: { type: NotificationType; title: string; body?: string; link?: string; key?: string }) {
  return safely(`notification ${input.type}`, async (): Promise<NotificationDoc | null> => {
    const topic: NotifyTopic = TOPIC_OF[input.type];
    const roles = TOPIC_ROLES[topic];
    let doc: NotificationDoc;
    try {
      doc = await Notification.create({ ...input, body: input.body ?? '', roles });
    } catch (err) {
      if (isDuplicateKey(err)) return null; // already notified
      throw err;
    }
    const staff = await User.find({ role: { $in: roles }, status: 'active' }).select('name email role notify');
    for (const member of staff) {
      if (emailPrefs(member)[topic]) await sendStaffAlert(member, doc);
    }
    return doc;
  });
}

// ---- Orders ----

/**
 * After the webhook marks an order paid. Safe to call on every redelivery: the confirmation is
 * sent once (checked against the email log) and the notification is keyed by order.
 */
export async function orderPaid(order: OrderDoc): Promise<void> {
  const customer = await safely('load customer', () => User.findById(order.user).select('name email'));
  if (customer) {
    await safely('order confirmation', async () => {
      const sent = await EmailLog.exists({ order: order._id, template: 'order_confirmation', status: { $ne: 'failed' } });
      if (!sent) await sendOrderConfirmation(order, customer);
    });
  }
  const units = order.items.reduce((n, i) => n + i.quantity, 0);
  await notify({
    type: 'order_paid',
    key: `order_paid:${order.id}`,
    title: `New order ${orderNumber(order.id)} · ${formatMoney(order.total, order.currency)}`,
    body: `${customer?.name ?? 'A customer'} bought ${units} ${units === 1 ? 'item' : 'items'}: ${order.items.map((i) => i.name).join(', ')}.`.slice(0, 300),
    link: `/admin/orders/${order.id}`,
  });
}

/**
 * Tells the customer about a refund or a cancellation. Refunds made as part of a cancellation
 * are left to the cancellation email, so the customer gets one message, not two.
 */
export async function customerOrderUpdate(order: OrderDoc, input: { amount: number; cancelled: boolean }): Promise<void> {
  await safely('refund/cancellation email', async () => {
    const customer = await User.findById(order.user).select('name email');
    if (customer) await sendRefundOrCancellation(order, customer, input);
  });
}

// ---- Stock ----

/** Called for every stock decrease. Alerts only when a product crosses into low or out of stock. */
export async function stockDropped(product: { _id: Types.ObjectId; name: string }, before: number, after: number): Promise<void> {
  if (after >= before) return;
  const settings = await safely('settings', () => getSettings());
  if (!settings) return;
  const threshold = settings.lowStockThreshold;
  const link = `/admin/products/${product._id.toString()}`;
  if (after === 0) {
    await notify({ type: 'out_of_stock', title: `${product.name} is out of stock`, body: 'It can’t be bought until you restock it.', link });
  } else if (before > threshold && after <= threshold) {
    await notify({
      type: 'low_stock',
      title: `${product.name} is running low`,
      body: `Only ${after} left (your alert level is ${threshold}).`,
      link,
    });
  }
}

// ---- Payments ----

/** A Stripe webhook we couldn't process. Stripe retries it, so this is keyed by event id. */
export async function webhookFailed(event: { id: string; type: string }, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await notify({
    type: 'webhook_failed',
    key: `webhook:${event.id}`,
    title: `Stripe event couldn’t be processed: ${event.type}`,
    body: `Event ${event.id}: ${message.slice(0, 200)}. Stripe retries automatically for up to 3 days; once the cause is fixed it will go through on the next attempt.`,
  });
}

/** Marks an earlier failure of this event as resolved once a retry succeeds. */
export async function webhookSucceeded(eventId: string): Promise<void> {
  await safely('resolve webhook notification', () =>
    Notification.updateOne({ key: `webhook:${eventId}`, resolvedAt: { $exists: false } }, { resolvedAt: new Date() })
  );
}

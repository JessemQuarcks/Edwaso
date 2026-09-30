import type { OrderDoc } from '../models/Order.js';
import type { UserDoc } from '../models/User.js';
import { layout, sendEmail } from './mailer.js';
import { getSettings } from './settings.js';

const shortId = (id: string) => `#${id.slice(-8).toUpperCase()}`;

export async function sendOrderShipped(order: OrderDoc, customer: Pick<UserDoc, '_id' | 'name' | 'email'>) {
  const { storeName } = await getSettings();
  const f = order.fulfillment ?? {};
  const lines = [
    `Hi ${customer.name.split(' ')[0]},`,
    `Good news: order ${shortId(order.id)} is on its way.`,
    ...(f.carrier || f.trackingNumber ? [`Carrier: ${f.carrier ?? '—'} · Tracking number: ${f.trackingNumber ?? '—'}`] : []),
    'Thanks for shopping with us.',
  ];
  const url = `${process.env.CLIENT_URL}/orders`;
  return sendEmail({
    to: customer.email,
    subject: `Your order ${shortId(order.id)} has shipped`,
    text: [...lines, f.trackingUrl ? `Track it: ${f.trackingUrl}` : `Your orders: ${url}`].join('\n\n'),
    html: layout(storeName, 'Your order has shipped', lines, f.trackingUrl ? { label: 'Track your parcel', url: f.trackingUrl } : { label: 'View your orders', url }),
    template: 'order_shipped',
    user: customer._id,
    order: order._id,
  });
}

export async function sendPasswordReset(customer: Pick<UserDoc, '_id' | 'name' | 'email'>, token: string) {
  const { storeName } = await getSettings();
  const url = `${process.env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const lines = [
    `Hi ${customer.name.split(' ')[0]},`,
    'We received a request to reset your password. The link below works once and expires in one hour.',
    'If you didn’t ask for this, you can ignore this email; your password stays the same.',
  ];
  return sendEmail({
    to: customer.email,
    subject: `Reset your ${storeName} password`,
    text: [...lines, url].join('\n\n'),
    html: layout(storeName, 'Reset your password', lines, { label: 'Choose a new password', url }),
    template: 'password_reset',
    user: customer._id,
  });
}

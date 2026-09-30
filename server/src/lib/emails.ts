import type { OrderDoc } from '../models/Order.js';
import type { UserDoc } from '../models/User.js';
import type { NotificationDoc } from '../models/Notification.js';
import { renderEmail, type EmailBlock } from './email-template.js';
import { sendEmail } from './mailer.js';
import { getSettings } from './settings.js';
import { formatMoney, orderNumber } from './text.js';

// Every email the app sends. Customer emails are transactional (no marketing), reply to the
// store's support address, and link back to the customer's account.

type Recipient = Pick<UserDoc, '_id' | 'name' | 'email'>;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const clientUrl = (path: string) => `${process.env.CLIENT_URL ?? 'http://localhost:3000'}${path}`;

async function store() {
  const { storeName, supportEmail } = await getSettings();
  const footer = [
    supportEmail ? `Questions? Reply to this email or write to ${supportEmail}.` : 'Questions? Just reply to this email.',
    `© ${new Date().getFullYear()} ${storeName}`,
  ];
  return { storeName, supportEmail: supportEmail || undefined, footer };
}

function orderSummary(order: OrderDoc): EmailBlock {
  const money = (c: number) => formatMoney(c, order.currency);
  const p = order.payment;
  const totals: { label: string; amount: string; strong?: boolean }[] = [];
  if (p?.amountSubtotal !== undefined && p.amountSubtotal !== p.amountTotal) totals.push({ label: 'Subtotal', amount: money(p.amountSubtotal) });
  if (p?.amountShipping) totals.push({ label: 'Shipping', amount: money(p.amountShipping) });
  if (p?.amountTax) totals.push({ label: 'Tax', amount: money(p.amountTax) });
  totals.push({ label: 'Total', amount: money(p?.amountTotal ?? order.total), strong: true });
  return {
    type: 'items',
    items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: money(i.price * i.quantity) })),
    totals,
  };
}

function addressBlock(order: OrderDoc): EmailBlock[] {
  const a = order.shippingAddress;
  if (!a?.line1) return [];
  const value = [a.name, a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean).join(', ');
  return [{ type: 'details', rows: [{ label: 'Delivering to', value }] }];
}

export async function sendOrderConfirmation(order: OrderDoc, customer: Recipient) {
  const s = await store();
  const number = orderNumber(order.id);
  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: `We’ve received your order ${number} and we’re getting it ready.`,
    eyebrow: `Order ${number}`,
    heading: 'Thanks for your order',
    blocks: [
      { type: 'text', text: `Hi ${firstName(customer.name)}, your payment went through and we’re getting your order ready. We’ll email you again when it ships.` },
      orderSummary(order),
      ...addressBlock(order),
      { type: 'button', label: 'View your order', url: clientUrl(`/account/orders/${order.id}`) },
    ],
    footer: s.footer,
  });
  return sendEmail({
    to: customer.email,
    subject: `Order confirmed: ${number}`,
    html,
    text,
    replyTo: s.supportEmail,
    template: 'order_confirmation',
    user: customer._id,
    order: order._id,
  });
}

export async function sendOrderShipped(order: OrderDoc, customer: Recipient) {
  const s = await store();
  const number = orderNumber(order.id);
  const f = order.fulfillment ?? {};
  const rows = [
    ...(f.carrier ? [{ label: 'Carrier', value: f.carrier }] : []),
    ...(f.trackingNumber ? [{ label: 'Tracking number', value: f.trackingNumber }] : []),
  ];
  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: `Order ${number} is on its way.`,
    eyebrow: `Order ${number}`,
    heading: 'Your order is on its way',
    blocks: [
      { type: 'text', text: `Hi ${firstName(customer.name)}, good news: your order has shipped.` },
      ...(rows.length ? [{ type: 'details' as const, rows }] : []),
      f.trackingUrl
        ? { type: 'button', label: 'Track your parcel', url: f.trackingUrl }
        : { type: 'button', label: 'View your order', url: clientUrl(`/account/orders/${order.id}`) },
      {
        type: 'items',
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: formatMoney(i.price * i.quantity, order.currency) })),
        totals: [],
      },
      ...addressBlock(order),
    ],
    footer: s.footer,
  });
  return sendEmail({
    to: customer.email,
    subject: `Your order ${number} has shipped`,
    html,
    text,
    replyTo: s.supportEmail,
    template: 'order_shipped',
    user: customer._id,
    order: order._id,
  });
}

/** A refund landed. `cancelled`: the order was cancelled (with or without a refund). */
export async function sendRefundOrCancellation(order: OrderDoc, customer: Recipient, input: { amount: number; cancelled: boolean }) {
  const s = await store();
  const number = orderNumber(order.id);
  const money = (c: number) => formatMoney(c, order.currency);
  const refunded = input.amount > 0;
  // The order normally already includes this refund; never show less than it.
  const refundedTotal = Math.max(order.amountRefunded ?? 0, input.amount);
  const fullyRefunded = refundedTotal >= order.total;

  const heading = input.cancelled ? 'Your order has been cancelled' : fullyRefunded ? 'Your refund is on its way' : 'We’ve refunded part of your order';
  const lead = input.cancelled
    ? refunded
      ? `Hi ${firstName(customer.name)}, we’ve cancelled your order and refunded ${money(input.amount)} to your original payment method.`
      : `Hi ${firstName(customer.name)}, we’ve cancelled your order. If you were charged, we’ll be in touch about your refund.`
    : `Hi ${firstName(customer.name)}, we’ve refunded ${money(input.amount)} to your original payment method.`;

  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: refunded ? `${money(input.amount)} refunded for order ${number}.` : `Order ${number} was cancelled.`,
    eyebrow: `Order ${number}`,
    heading,
    blocks: [
      { type: 'text', text: lead },
      ...(refunded
        ? [
            {
              type: 'details' as const,
              rows: [
                { label: 'Refunded now', value: money(input.amount) },
                { label: 'Refunded in total', value: `${money(refundedTotal)} of ${money(order.total)}` },
              ],
            },
            { type: 'muted' as const, text: 'Refunds usually appear on your statement within 5–10 business days, depending on your bank.' },
          ]
        : []),
      { type: 'button', label: 'View your order', url: clientUrl(`/account/orders/${order.id}`) },
    ],
    footer: s.footer,
  });
  return sendEmail({
    to: customer.email,
    subject: input.cancelled ? `Order ${number} cancelled` : `Refund for order ${number}`,
    html,
    text,
    replyTo: s.supportEmail,
    template: input.cancelled ? 'order_cancelled' : 'refund_issued',
    user: customer._id,
    order: order._id,
  });
}

export async function sendPasswordReset(customer: Recipient, token: string) {
  const s = await store();
  const url = clientUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: 'Use this link to choose a new password. It expires in one hour.',
    heading: 'Reset your password',
    blocks: [
      { type: 'text', text: `Hi ${firstName(customer.name)}, we received a request to reset your password. The link below works once and expires in one hour.` },
      { type: 'button', label: 'Choose a new password', url },
      { type: 'muted', text: 'If you didn’t ask for this, you can ignore this email; your password stays the same.' },
    ],
    footer: s.footer,
  });
  return sendEmail({
    to: customer.email,
    subject: `Reset your ${s.storeName} password`,
    html,
    text,
    replyTo: s.supportEmail,
    template: 'password_reset',
    user: customer._id,
  });
}

export async function sendAdminInvite(input: { email: string; role: string; inviterName: string; url: string; expiresAt: Date }) {
  const s = await store();
  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: `${input.inviterName} invited you to help run ${s.storeName}.`,
    eyebrow: 'Team invitation',
    heading: `Join ${s.storeName} as ${input.role}`,
    blocks: [
      { type: 'text', text: `${input.inviterName} invited you to the ${s.storeName} admin console. You’ll choose a password and set up two-factor sign-in with an authenticator app.` },
      { type: 'button', label: 'Accept invitation', url: input.url },
      {
        type: 'muted',
        text: `The link works once and expires ${input.expiresAt.toUTCString()}. If you weren’t expecting this, ignore this email and nothing happens.`,
      },
    ],
    footer: [`Sent by ${s.storeName} on behalf of ${input.inviterName}.`],
  });
  return sendEmail({ to: input.email, subject: `You’re invited to ${s.storeName}`, html, text, template: 'admin_invite' });
}

/** A console notification, emailed to a staff member who opted in. */
export async function sendStaffAlert(user: Recipient, n: Pick<NotificationDoc, 'type' | 'title' | 'body' | 'link'>) {
  const s = await store();
  const { html, text } = renderEmail({
    storeName: s.storeName,
    preheader: n.body,
    eyebrow: 'Admin alert',
    heading: n.title,
    blocks: [
      ...(n.body ? [{ type: 'text' as const, text: n.body }] : []),
      { type: 'button', label: 'Open in the console', url: clientUrl(n.link ?? '/admin') },
    ],
    footer: ['You get these because of your email settings in Admin → Account & security.'],
  });
  return sendEmail({ to: user.email, subject: `[${s.storeName}] ${n.title}`, html, text, template: `alert_${n.type}`, user: user._id });
}

/** From Settings, to check the email provider works. */
export async function sendTestEmail(user: Recipient) {
  const s = await store();
  const { html, text } = renderEmail({
    storeName: s.storeName,
    heading: 'Email is working',
    blocks: [
      { type: 'text', text: `Hi ${firstName(user.name)}, this is a test from your ${s.storeName} admin console. Order and account emails will look like this.` },
      { type: 'button', label: 'Open the console', url: clientUrl('/admin/settings') },
    ],
    footer: s.footer,
  });
  return sendEmail({ to: user.email, subject: `Test email from ${s.storeName}`, html, text, replyTo: s.supportEmail, template: 'test', user: user._id });
}

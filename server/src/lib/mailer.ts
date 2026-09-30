import type { Types } from 'mongoose';
import EmailLog, { type EmailLogDoc } from '../models/EmailLog.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Short name for the log, e.g. `order_shipped`. */
  template: string;
  /** Where replies go, usually the store's support address. */
  replyTo?: string;
  user?: Types.ObjectId;
  order?: Types.ObjectId;
}

export const emailConfigured = (): boolean => !!process.env.RESEND_API_KEY;
export const emailFrom = (): string => process.env.EMAIL_FROM ?? 'Shop <onboarding@resend.dev>';

/**
 * Sends through Resend when RESEND_API_KEY is set. Without it, development prints the email to
 * the server console so links can be followed, and production logs only that it was skipped.
 * Never throws: the outcome is recorded in EmailLog and returned, so an email problem can't undo
 * the action that triggered it.
 */
export async function sendEmail(email: Email): Promise<EmailLogDoc> {
  const base = { to: email.to, subject: email.subject, template: email.template, user: email.user, order: email.order };
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n[email] to: ${email.to}\n[email] subject: ${email.subject}\n${email.text}\n`);
    } else if (process.env.NODE_ENV === 'production') {
      console.warn(`[email] RESEND_API_KEY not set; "${email.template}" email to ${email.to} was not sent`);
    }
    return EmailLog.create({ ...base, status: 'logged' });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailFrom(),
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(data.message ?? `Resend responded ${res.status}`);
    return EmailLog.create({ ...base, status: 'sent', providerId: data.id });
  } catch (err) {
    console.error(`[email] failed to send "${email.template}" to ${email.to}:`, err);
    return EmailLog.create({ ...base, status: 'failed', error: (err as Error).message.slice(0, 300) });
  }
}

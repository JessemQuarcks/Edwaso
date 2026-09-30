import type { Types } from 'mongoose';
import EmailLog, { type EmailLogDoc } from '../models/EmailLog.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Short name for the log, e.g. `order_shipped`. */
  template: string;
  user?: Types.ObjectId;
  order?: Types.ObjectId;
}

/**
 * Sends through Resend when RESEND_API_KEY is set (roadmap phase 4 can swap providers here).
 * Without it, development prints the email to the server console so links can be followed,
 * and production logs only that an email was skipped.
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
        from: process.env.EMAIL_FROM ?? 'Shop <onboarding@resend.dev>',
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, client-safe layout: every dynamic value is escaped. */
export function layout(storeName: string, heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(p)}</p>`).join('');
  const cta = button
    ? `<p style="margin:20px 0"><a href="${escapeHtml(button.url)}" style="background:#171717;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#171717;background:#f5f5f5;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-weight:600">${escapeHtml(storeName)}</p>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${cta}
</div></body></html>`;
}

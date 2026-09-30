// One renderer for every email: content is described as blocks and turned into both an HTML
// body (table layout and inline styles, which is what email clients understand) and a plain-text
// body, so the two never drift apart. Every dynamic value is escaped.

export type EmailBlock =
  | { type: 'text'; text: string }
  | { type: 'muted'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'details'; rows: { label: string; value: string }[] }
  | {
      type: 'items';
      items: { name: string; quantity: number; amount: string }[];
      totals: { label: string; amount: string; strong?: boolean }[];
    };

export interface EmailContent {
  storeName: string;
  /** Inbox preview line. */
  preheader?: string;
  /** Small label above the heading, e.g. "Order #1A2B3C4D". */
  eyebrow?: string;
  heading: string;
  blocks: EmailBlock[];
  footer: string[];
}

const INK = '#171717';
const MUTED = '#6b6b6b';
const LINE = '#e8e8e8';
const ACCENT = '#c2410c';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only http(s) links become buttons; anything else is shown as text. */
const isWebUrl = (url: string): boolean => /^https?:\/\/[^\s"'<>]+$/i.test(url);

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${escapeHtml(block.text)}</p>`;
    case 'muted':
      return `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${MUTED}">${escapeHtml(block.text)}</p>`;
    case 'button':
      if (!isWebUrl(block.url)) return blockHtml({ type: 'text', text: `${block.label}: ${block.url}` });
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="border-radius:999px;background:${INK}">
<a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(block.label)}</a>
</td></tr></table>`;
    case 'details':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid ${LINE};border-radius:12px">
${block.rows
  .map(
    (r, i) => `<tr><td style="padding:10px 14px;font-size:13px;color:${MUTED};${i ? `border-top:1px solid ${LINE};` : ''}width:40%">${escapeHtml(r.label)}</td>
<td style="padding:10px 14px;font-size:14px;color:${INK};${i ? `border-top:1px solid ${LINE};` : ''}">${escapeHtml(r.value)}</td></tr>`
  )
  .join('\n')}
</table>`;
    case 'items':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">
${block.items
  .map(
    (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK}">${escapeHtml(i.name)}<span style="color:${MUTED}"> × ${i.quantity}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};white-space:nowrap">${escapeHtml(i.amount)}</td></tr>`
  )
  .join('\n')}
${block.totals
  .map(
    (t) => `<tr><td style="padding:8px 0 0;font-size:${t.strong ? 15 : 13}px;color:${t.strong ? INK : MUTED};${t.strong ? 'font-weight:600;' : ''}">${escapeHtml(t.label)}</td>
<td align="right" style="padding:8px 0 0;font-size:${t.strong ? 15 : 13}px;color:${t.strong ? INK : MUTED};${t.strong ? 'font-weight:600;' : ''}white-space:nowrap">${escapeHtml(t.amount)}</td></tr>`
  )
  .join('\n')}
</table>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
    case 'muted':
      return block.text;
    case 'button':
      return `${block.label}: ${block.url}`;
    case 'details':
      return block.rows.map((r) => `${r.label}: ${r.value}`).join('\n');
    case 'items':
      return [
        ...block.items.map((i) => `${i.quantity} × ${i.name}  ${i.amount}`),
        '',
        ...block.totals.map((t) => `${t.label}: ${t.amount}`),
      ].join('\n');
  }
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const preheader = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>`
    : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px;font-size:15px;font-weight:700;color:${INK}">${escapeHtml(c.storeName)}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px">
${c.eyebrow ? `<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${ACCENT}">${escapeHtml(c.eyebrow)}</p>` : ''}
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(c.heading)}</h1>
${c.blocks.map(blockHtml).join('\n')}
</td></tr>
<tr><td style="padding:18px 4px 0">
${c.footer.map((f) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(f)}</p>`).join('\n')}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    c.eyebrow ? `${c.eyebrow}\n${c.heading}` : c.heading,
    ...c.blocks.map(blockText),
    '—',
    ...c.footer,
  ].join('\n\n');

  return { html, text };
}

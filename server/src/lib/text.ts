/** Escapes user input for use inside a RegExp / MongoDB $regex. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Spreadsheet apps execute cells starting with these as formulas ("CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

const moneyFormats = new Map<string, Intl.NumberFormat>();

/** Formats an amount in the smallest currency unit (cents), e.g. 1999, 'usd' -> "$19.99". */
export function formatMoney(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  let fmt = moneyFormats.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    moneyFormats.set(code, fmt);
  }
  return fmt.format(cents / 100);
}

/** Customer-facing order number: the last 8 characters of the id. */
export const orderNumber = (id: string): string => `#${id.slice(-8).toUpperCase()}`;

import { Router } from 'express';
import { z } from 'zod';
import Order from '../../models/Order.js';
import { CURRENCIES } from '../../models/Settings.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireAdmin, requireRole } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { getSettings, updateSettings } from '../../lib/settings.js';
import { emailConfigured, emailFrom } from '../../lib/mailer.js';
import { sendTestEmail } from '../../lib/emails.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [settings, hasOrders] = await Promise.all([getSettings(), Order.exists({})]);
    res.json({ settings, currencyLocked: !!hasOrders, email: { configured: emailConfigured(), from: emailFrom() } });
  })
);

/** Sends a sample email to the signed-in admin, to check the provider is set up. */
router.post(
  '/test-email',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const log = await sendTestEmail(user);
    await audit(req, 'settings.test_email', { meta: { to: user.email, status: log.status } });
    res.json({ status: log.status, to: user.email, error: log.error });
  })
);

const text = (max: number) => z.string().trim().max(max).default('');
const httpsUrl = z.union([z.literal(''), z.url({ protocol: /^https$/, error: 'Use a full https:// link' })]).default('');
/** An in-site path ("/shop?category=bags") or an https link; never javascript: or protocol-relative. */
const linkHref = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\/\S+$/.test(v), 'Use a path like /shop or a full https:// link')
  .default('');

export const storefrontSchema = z.object({
  announcement: text(160),
  heroEyebrow: text(40),
  heroTitle: z.string().trim().min(1, 'The hero needs a headline').max(120),
  heroSubtitle: text(300),
  promo: z.object({
    title: text(120),
    body: text(600),
    ctaLabel: text(40),
    ctaHref: linkHref,
    image: z.union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Image must be an http(s) URL' })]).default(''),
  }),
  testimonials: z
    .array(z.object({ quote: z.string().trim().min(1, 'Add the quote').max(400), author: z.string().trim().min(1, 'Add who said it').max(80), detail: text(80) }))
    .max(6, 'Up to 6 testimonials'),
  social: z.object({ instagram: httpsUrl, facebook: httpsUrl, x: httpsUrl, tiktok: httpsUrl }),
});

const updateSchema = z
  .object({
    storeName: z.string().trim().min(1, 'Store name is required').max(80),
    supportEmail: z.union([z.literal(''), z.email('Enter a valid support email')]),
    currency: z.enum(CURRENCIES, { error: 'Unsupported currency' }),
    shippingCountries: z
      .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use two-letter country codes'))
      .min(1, 'Allow at least one shipping country')
      .max(250),
    automaticTax: z.boolean(),
    lowStockThreshold: z.number().int().min(0).max(10_000),
    storefront: storefrontSchema,
  })
  .partial();

router.patch(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const changes = parse(updateSchema, req.body);
    const before = await getSettings();
    // Prices and orders are stored in the store currency's cents; switching after the first
    // order would silently relabel every historic amount.
    if (changes.currency && changes.currency !== before.currency && (await Order.exists({}))) {
      throw new HttpError(409, 'The currency can’t change once the store has orders');
    }
    if (changes.shippingCountries) changes.shippingCountries = [...new Set(changes.shippingCountries)];
    const settings = await updateSettings(changes);
    await audit(req, 'settings.update', { entity: 'Settings', before, after: settings });
    res.json({ settings });
  })
);

export default router;

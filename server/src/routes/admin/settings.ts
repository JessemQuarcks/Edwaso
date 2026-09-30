import { Router } from 'express';
import { z } from 'zod';
import Order from '../../models/Order.js';
import { CURRENCIES } from '../../models/Settings.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/adminSession.js';
import { audit } from '../../lib/audit.js';
import { getSettings, updateSettings } from '../../lib/settings.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [settings, hasOrders] = await Promise.all([getSettings(), Order.exists({})]);
    res.json({ settings, currencyLocked: !!hasOrders });
  })
);

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

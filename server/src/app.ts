import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { asyncHandler, notFound, errorHandler } from './middleware/error.js';
import { stripeWebhook } from './routes/webhook.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import checkoutRoutes from './routes/checkout.js';
import adminRoutes from './routes/admin/index.js';
import newsletterRoutes from './routes/newsletter.js';
import { getSettings } from './lib/settings.js';
import { UPLOAD_DIR, UPLOAD_PATH } from './lib/storage.js';

export const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'CLIENT_URL'] as const;

/** Parses TRUST_PROXY into what Express expects: a hop count, a boolean or an address list. */
function trustProxy(value = 'loopback'): boolean | number | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}

// Built separately from index.ts so tests can mount the app without listening or connecting.
export function createApp(): Express {
  const app = express();

  // The admin console reaches the API through the Next.js proxy (see client/next.config.ts),
  // so req.ip is only the real client address if that hop is trusted.
  app.set('trust proxy', trustProxy(process.env.TRUST_PROXY));

  app.use(helmet());
  // Storefront calls are cross-origin Bearer requests; the admin console is same-origin via the
  // proxy and does not need CORS credentials.
  app.use(cors({ origin: process.env.CLIENT_URL }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  // Must come BEFORE express.json(): Stripe needs the raw request body.
  app.post('/api/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Uploaded product images. Cross-origin readable so the storefront (another origin) can show
  // them, and locked down so a file can never run as a page.
  app.use(
    UPLOAD_PATH,
    (_req, res, next) => {
      res.set({
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'",
        'X-Content-Type-Options': 'nosniff',
      });
      next();
    },
    express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny', maxAge: '365d', immutable: true })
  );

  // What the storefront needs to know about the store.
  app.get(
    '/api/settings',
    asyncHandler(async (_req, res) => {
      const { storeName, currency, supportEmail, storefront, shippingCountries } = await getSettings();
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ storeName, currency, supportEmail, storefront, shippingCountries });
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/checkout', checkoutRoutes);
  app.use('/api/newsletter', newsletterRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

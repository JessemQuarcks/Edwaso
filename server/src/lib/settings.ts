import Settings, { CURRENCIES, DEFAULT_STOREFRONT, type Currency, type ISettings, type IStorefront } from '../models/Settings.js';

export type StoreSettings = Omit<ISettings, 'key' | 'updatedAt'>;

const envCurrency = (process.env.CURRENCY ?? 'usd').toLowerCase();
const DEFAULTS: StoreSettings = {
  storeName: 'Shop',
  supportEmail: '',
  currency: (CURRENCIES as readonly string[]).includes(envCurrency) ? (envCurrency as Currency) : 'usd',
  shippingCountries: ['US', 'CA', 'GB'],
  automaticTax: false,
  lowStockThreshold: 5,
  storefront: DEFAULT_STOREFRONT,
};

/** Older documents may lack newer storefront fields; fill them from the defaults. */
const withDefaults = (s?: Partial<IStorefront>): IStorefront => ({
  ...DEFAULT_STOREFRONT,
  ...s,
  promo: { ...DEFAULT_STOREFRONT.promo, ...s?.promo },
  social: { ...DEFAULT_STOREFRONT.social, ...s?.social },
  testimonials: s?.testimonials ?? [],
});

// Read on nearly every admin request and every checkout; cached briefly in-process.
const TTL_MS = 30_000;
let cached: { value: StoreSettings; at: number } | null = null;

export async function getSettings(): Promise<StoreSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const doc = await Settings.findOne({ key: 'store' }).lean();
  const value: StoreSettings = doc
    ? {
        storeName: doc.storeName,
        supportEmail: doc.supportEmail,
        currency: doc.currency,
        shippingCountries: doc.shippingCountries,
        automaticTax: doc.automaticTax,
        lowStockThreshold: doc.lowStockThreshold,
        storefront: withDefaults(doc.storefront),
      }
    : DEFAULTS;
  cached = { value, at: Date.now() };
  return value;
}

export async function updateSettings(changes: Partial<StoreSettings>): Promise<StoreSettings> {
  await Settings.findOneAndUpdate(
    { key: 'store' },
    // The filter supplies `key` on insert; defaults fill whatever this change doesn't set.
    { $set: changes, $setOnInsert: omit(DEFAULTS, Object.keys(changes)) },
    { upsert: true, runValidators: true }
  );
  cached = null;
  return getSettings();
}

/** Tests reset the database between cases; they must also reset the cache. */
export const clearSettingsCache = (): void => {
  cached = null;
};

function omit<T extends object>(obj: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k))) as Partial<T>;
}

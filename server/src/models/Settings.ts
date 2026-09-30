import mongoose, { Schema } from 'mongoose';

/** Two-decimal currencies only: prices are stored in cents throughout. */
export const CURRENCIES = ['usd', 'eur', 'gbp', 'cad', 'aud', 'nzd', 'chf', 'sek', 'nok', 'dkk', 'ghs', 'ngn', 'kes', 'zar'] as const;
export type Currency = (typeof CURRENCIES)[number];

// Store-wide settings: a single document keyed 'store'.
export interface ISettings {
  key: 'store';
  storeName: string;
  supportEmail: string;
  currency: Currency;
  /** ISO 3166-1 alpha-2 codes Stripe Checkout may ship to. */
  shippingCountries: string[];
  /** Stripe Tax's automatic calculation (needs Stripe Tax set up on the account). */
  automaticTax: boolean;
  lowStockThreshold: number;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    key: { type: String, default: 'store', unique: true, immutable: true },
    storeName: { type: String, default: 'Shop', trim: true },
    supportEmail: { type: String, default: '', trim: true, lowercase: true },
    currency: { type: String, enum: CURRENCIES, default: 'usd' },
    shippingCountries: { type: [String], default: ['US', 'CA', 'GB'] },
    automaticTax: { type: Boolean, default: false },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export default mongoose.model<ISettings>('Settings', settingsSchema);

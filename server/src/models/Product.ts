import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Storefront visibility. Products created before `status` existed have none and count as active. */
export const VISIBLE = { status: { $nin: ['draft', 'archived'] } } as const;

export const MAX_IMAGES = 8;

export interface IProduct {
  name: string;
  description: string;
  /** Smallest currency unit (cents) — avoids floating point errors. */
  price: number;
  /** "Was" price shown struck through; only meaningful when higher than `price`. */
  compareAtPrice?: number;
  /** What the item costs the store, for margin reporting. Never sent to the storefront. */
  costPrice?: number;
  sku?: string;
  /** Ordered gallery; the first is the main image. */
  images: string[];
  /** Mirrors images[0] for older clients and order snapshots. */
  image: string;
  /** Category slug (see Category). */
  category: string;
  stock: number;
  featured: boolean;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDoc = HydratedDocument<IProduct>;

const integer = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0, validate: integer },
    compareAtPrice: { type: Number, min: 0, validate: integer },
    costPrice: { type: Number, min: 0, validate: integer, select: false },
    sku: { type: String, trim: true, uppercase: true },
    images: {
      type: [String],
      default: [],
      validate: { validator: (v: string[]) => v.length <= MAX_IMAGES, message: `At most ${MAX_IMAGES} images` },
    },
    image: { type: String, default: '' },
    category: { type: String, default: 'general', trim: true, lowercase: true, index: true },
    stock: { type: Number, default: 0, min: 0, validate: integer },
    featured: { type: Boolean, default: false, index: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active', index: true },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text' });
// Unique when present; many products may have no SKU.
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });

// Keep `image` and `images` in step: legacy products only have `image`.
productSchema.pre('validate', function (next) {
  if (this.isModified('images')) this.image = this.images[0] ?? '';
  else if (this.image && this.images.length === 0) this.images = [this.image];
  if (this.sku === '') this.sku = undefined;
  next();
});

export default mongoose.model<IProduct>('Product', productSchema);

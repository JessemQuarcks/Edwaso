import mongoose, { Schema, type HydratedDocument } from 'mongoose';

// Products reference a category by slug (Product.category), so the storefront's `?category=`
// filter and existing products keep working; this model adds a display name, image and order.
export interface ICategory {
  name: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryDoc = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'general';

export const titleCase = (slug: string): string =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default mongoose.model<ICategory>('Category', categorySchema);

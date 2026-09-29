import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface IProduct {
  name: string;
  description: string;
  /** Smallest currency unit (cents) — avoids floating point errors. */
  price: number;
  image: string;
  category: string;
  stock: number;
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
    image: { type: String, default: '' },
    category: { type: String, default: 'general', trim: true, index: true },
    stock: { type: Number, default: 0, min: 0, validate: integer },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IProduct>('Product', productSchema);

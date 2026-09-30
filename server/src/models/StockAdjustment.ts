import mongoose, { Schema, type HydratedDocument, type Types } from 'mongoose';

export const STOCK_REASONS = [
  'sale', // payment received
  'restock', // new inventory arrived
  'return', // customer return / refund restock
  'cancellation', // order cancelled, items put back
  'correction', // count was wrong
  'damaged', // written off
  'manual', // edited on the product form
  'import', // CSV import
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

// Append-only history of every change to a product's stock.
export interface IStockAdjustment {
  product: Types.ObjectId;
  delta: number;
  stockAfter: number;
  reason: StockReason;
  note?: string;
  order?: Types.ObjectId;
  /** The admin who made the change; absent for system changes. */
  by?: Types.ObjectId;
  createdAt: Date;
}

export type StockAdjustmentDoc = HydratedDocument<IStockAdjustment>;

const stockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    delta: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: { type: String, enum: STOCK_REASONS, required: true },
    note: String,
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockAdjustmentSchema.index({ product: 1, createdAt: -1 });

export default mongoose.model<IStockAdjustment>('StockAdjustment', stockAdjustmentSchema);

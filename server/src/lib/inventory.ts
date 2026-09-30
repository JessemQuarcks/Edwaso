import type { Types } from 'mongoose';
import Product from '../models/Product.js';
import StockAdjustment, { type StockReason } from '../models/StockAdjustment.js';
import { HttpError } from '../middleware/error.js';
import { stockDropped } from './notify.js';

interface Adjustment {
  product: Types.ObjectId | string;
  delta: number;
  reason: StockReason;
  note?: string;
  order?: Types.ObjectId;
  by?: Types.ObjectId;
}

/**
 * Changes stock atomically and records why. A decrease that would go below zero is refused
 * for manual changes; sales clamp at zero instead (the payment has already happened).
 */
export async function adjustStock(a: Adjustment): Promise<number | null> {
  if (a.delta === 0) return null;
  const clampAtZero = a.reason === 'sale';
  const filter = a.delta < 0 && !clampAtZero ? { _id: a.product, stock: { $gte: -a.delta } } : { _id: a.product };

  // Returns the product as it was before the change, so a low-stock crossing can be detected.
  const previous = clampAtZero
    ? await Product.findOneAndUpdate(filter, [{ $set: { stock: { $max: [0, { $add: ['$stock', a.delta] }] } } }])
    : await Product.findOneAndUpdate(filter, { $inc: { stock: a.delta } });

  if (!previous) {
    // Either the product is gone (deleted since the order) or there isn't enough stock.
    if (!(await Product.exists({ _id: a.product }))) return null;
    throw new HttpError(400, 'Not enough stock for that adjustment');
  }

  const stockAfter = clampAtZero ? Math.max(0, previous.stock + a.delta) : previous.stock + a.delta;
  await StockAdjustment.create({
    product: previous._id,
    delta: a.delta,
    stockAfter,
    reason: a.reason,
    note: a.note,
    order: a.order,
    by: a.by,
  });
  if (a.delta < 0) await stockDropped(previous, previous.stock, stockAfter);
  return stockAfter;
}

/** Applies the same kind of change to every line of an order. */
export async function adjustForOrder(
  order: { _id: Types.ObjectId; items: { product: Types.ObjectId; quantity: number }[] },
  direction: -1 | 1,
  reason: StockReason,
  by?: Types.ObjectId
): Promise<void> {
  for (const item of order.items) {
    await adjustStock({ product: item.product, delta: direction * item.quantity, reason, order: order._id, by });
  }
}

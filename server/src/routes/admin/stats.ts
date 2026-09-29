import { Router } from 'express';
import Order, { type OrderStatus } from '../../models/Order.js';
import Product from '../../models/Product.js';
import User from '../../models/User.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import {
  buckets,
  MONGO_FORMAT,
  percentChange,
  rangeQuerySchema,
  resolveRange,
  type Range,
  type Unit,
} from '../../lib/timeseries.js';

const router = Router();

/** Orders that count as sales: paid, whether or not they have shipped yet. */
export const COMPLETED: OrderStatus[] = ['paid', 'shipped'];
export const LOW_STOCK_THRESHOLD = 5;

/** When the sale happened. Orders marked paid by hand before `paidAt` existed fall back to creation. */
const SOLD_AT = { $ifNull: ['$paidAt', '$createdAt'] };

const soldBetween = (from: Date, to: Date) => ({
  status: { $in: COMPLETED },
  $or: [
    { paidAt: { $gte: from, $lt: to } },
    { paidAt: { $exists: false }, createdAt: { $gte: from, $lt: to } },
  ],
});

interface Totals {
  revenue: number;
  orders: number;
  units: number;
}

async function totals(from: Date, to: Date): Promise<Totals> {
  const [row] = await Order.aggregate<Totals>([
    { $match: soldBetween(from, to) },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
        units: { $sum: { $sum: '$items.quantity' } },
      },
    },
  ]);
  return row ?? { revenue: 0, orders: 0, units: 0 };
}

interface BucketRow {
  _id: string;
  revenue: number;
  orders: number;
}

async function bucketed(from: Date, to: Date, unit: Unit, tz: string): Promise<Map<string, BucketRow>> {
  const rows = await Order.aggregate<BucketRow>([
    { $match: soldBetween(from, to) },
    {
      $group: {
        _id: { $dateToString: { format: MONGO_FORMAT[unit], date: SOLD_AT, timezone: tz } },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

export interface SeriesPoint {
  key: string;
  start: string;
  revenue: number;
  orders: number;
  /** Same position in the previous period; null when there is no previous period. */
  previousRevenue: number | null;
  previousOrders: number | null;
}

/** Current period, bucket by bucket, with the previous period aligned by position. */
async function series(range: Range): Promise<SeriesPoint[]> {
  const current = buckets(range.from, range.to, range.unit, range.tz);
  const [cur, prev] = await Promise.all([
    bucketed(range.from, range.to, range.unit, range.tz),
    range.previous ? bucketed(range.previous.from, range.previous.to, range.unit, range.tz) : null,
  ]);
  const prevBuckets = range.previous ? buckets(range.previous.from, range.previous.to, range.unit, range.tz) : [];
  // Periods can differ by a bucket (e.g. month lengths); align the ends, which is the part readers compare.
  const offset = prevBuckets.length - current.length;

  return current.map((b, i) => {
    const row = cur.get(b.key);
    const prevKey = prevBuckets[i + offset]?.key;
    const prevRow = prevKey ? prev?.get(prevKey) : undefined;
    return {
      key: b.key,
      start: b.start.toISOString(),
      revenue: row?.revenue ?? 0,
      orders: row?.orders ?? 0,
      previousRevenue: prev && prevKey ? (prevRow?.revenue ?? 0) : null,
      previousOrders: prev && prevKey ? (prevRow?.orders ?? 0) : null,
    };
  });
}

interface ProductSales {
  productId: string;
  name: string;
  image?: string;
  category: string;
  units: number;
  revenue: number;
}

async function topProducts(from: Date, to: Date, limit: number): Promise<ProductSales[]> {
  const rows = await Order.aggregate<ProductSales & { _id: unknown }>([
    { $match: soldBetween(from, to) },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $last: '$items.name' },
        image: { $last: '$items.image' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
    { $sort: { units: -1, revenue: -1 } },
    { $limit: limit },
    // Prefer the live product's name, image and category; the order snapshot covers deleted ones.
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    {
      $project: {
        _id: 0,
        productId: { $toString: '$_id' },
        name: { $ifNull: [{ $first: '$product.name' }, '$name'] },
        image: { $ifNull: [{ $first: '$product.image' }, '$image'] },
        category: { $ifNull: [{ $first: '$product.category' }, 'uncategorised'] },
        units: 1,
        revenue: 1,
      },
    },
  ]);
  return rows;
}

const kpi = (value: number, previous?: number) => ({
  value,
  previous: previous ?? null,
  change: percentChange(value, previous),
});

async function earliestSale(): Promise<Date | null> {
  const first = await Order.findOne({ status: { $in: COMPLETED } })
    .sort({ createdAt: 1 })
    .select('createdAt paidAt');
  return first ? (first.paidAt ?? first.createdAt) : null;
}

async function rangeFor(query: unknown): Promise<Range> {
  const q = parse(rangeQuerySchema, query);
  try {
    return resolveRange(q, q.from ? null : await earliestSale());
  } catch (err) {
    if (err instanceof RangeError) throw new HttpError(400, err.message);
    throw err;
  }
}

const createdBetween = (from: Date, to: Date) => ({ createdAt: { $gte: from, $lt: to } });

// Everything the overview page shows, for one range.
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const range = await rangeFor(req.query);
    const { from, to, previous } = range;
    // Cancellations of orders that had been paid; expired checkouts aren't lost sales.
    const cancelled = { status: 'cancelled', paidAt: { $exists: true } };

    const [
      cur,
      prev,
      points,
      top,
      productCount,
      newProducts,
      cancelledNow,
      cancelledBefore,
      customersNow,
      customersBefore,
      recentOrders,
      lowStock,
      awaitingShipment,
    ] = await Promise.all([
      totals(from, to),
      previous ? totals(previous.from, previous.to) : undefined,
      series(range),
      topProducts(from, to, 5),
      Product.countDocuments(),
      Product.countDocuments(createdBetween(from, to)),
      Order.countDocuments({ ...cancelled, ...createdBetween(from, to) }),
      previous ? Order.countDocuments({ ...cancelled, ...createdBetween(previous.from, previous.to) }) : undefined,
      User.countDocuments({ role: 'customer', ...createdBetween(from, to) }),
      previous ? User.countDocuments({ role: 'customer', ...createdBetween(previous.from, previous.to) }) : undefined,
      Order.find({ status: { $ne: 'pending' } })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'name email'),
      Product.find({ stock: { $lte: LOW_STOCK_THRESHOLD } })
        .sort({ stock: 1 })
        .limit(5)
        .select('name stock image'),
      Order.countDocuments({ status: 'paid' }),
    ]);

    res.json({
      range: { from, to, unit: range.unit, tz: range.tz, previous: previous ?? null },
      kpis: {
        revenue: kpi(cur.revenue, prev?.revenue),
        completedOrders: kpi(cur.orders, prev?.orders),
        averageOrderValue: kpi(
          cur.orders ? Math.round(cur.revenue / cur.orders) : 0,
          prev ? (prev.orders ? Math.round(prev.revenue / prev.orders) : 0) : undefined
        ),
        cancelledOrders: kpi(cancelledNow, cancelledBefore),
        newCustomers: kpi(customersNow, customersBefore),
        products: { value: productCount, added: newProducts },
      },
      series: points,
      topProducts: top,
      recentOrders,
      lowStock,
      awaitingShipment,
    });
  })
);

// Deeper breakdowns for the analytics page.
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const range = await rangeFor(req.query);
    const { from, to, previous } = range;

    const [cur, prev, points, top, byCategory, byStatus, topCustomers, customersNow, customersBefore] =
      await Promise.all([
        totals(from, to),
        previous ? totals(previous.from, previous.to) : undefined,
        series(range),
        topProducts(from, to, 10),
        Order.aggregate<{ category: string; revenue: number; units: number }>([
          { $match: soldBetween(from, to) },
          { $unwind: '$items' },
          { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
          {
            $group: {
              _id: { $ifNull: [{ $first: '$product.category' }, 'uncategorised'] },
              revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
              units: { $sum: '$items.quantity' },
            },
          },
          { $sort: { revenue: -1 } },
          { $project: { _id: 0, category: '$_id', revenue: 1, units: 1 } },
        ]),
        Order.aggregate<{ status: OrderStatus; count: number }>([
          { $match: { createdAt: { $gte: from, $lt: to } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ]),
        Order.aggregate<{ customerId: string; name: string; email: string; orders: number; spent: number }>([
          { $match: soldBetween(from, to) },
          { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
          { $sort: { spent: -1 } },
          { $limit: 5 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          {
            $project: {
              _id: 0,
              customerId: { $toString: '$_id' },
              name: { $ifNull: [{ $first: '$user.name' }, 'Deleted customer'] },
              email: { $ifNull: [{ $first: '$user.email' }, ''] },
              orders: 1,
              spent: 1,
            },
          },
        ]),
        User.countDocuments({ role: 'customer', ...createdBetween(from, to) }),
        previous ? User.countDocuments({ role: 'customer', ...createdBetween(previous.from, previous.to) }) : undefined,
      ]);

    // Beyond seven categories the bars stop being comparable; fold the tail into "Other".
    const MAX_CATEGORIES = 7;
    const categories =
      byCategory.length > MAX_CATEGORIES
        ? [
            ...byCategory.slice(0, MAX_CATEGORIES - 1),
            byCategory.slice(MAX_CATEGORIES - 1).reduce(
              (acc, c) => ({ category: 'Other', revenue: acc.revenue + c.revenue, units: acc.units + c.units }),
              { category: 'Other', revenue: 0, units: 0 }
            ),
          ]
        : byCategory;

    const aov = (t: Totals) => (t.orders ? Math.round(t.revenue / t.orders) : 0);

    res.json({
      range: { from, to, unit: range.unit, tz: range.tz, previous: previous ?? null },
      summary: {
        revenue: kpi(cur.revenue, prev?.revenue),
        orders: kpi(cur.orders, prev?.orders),
        averageOrderValue: kpi(aov(cur), prev ? aov(prev) : undefined),
        unitsSold: kpi(cur.units, prev?.units),
        newCustomers: kpi(customersNow, customersBefore),
      },
      series: points,
      byCategory: categories,
      byStatus,
      topProducts: top,
      topCustomers,
    });
  })
);

export default router;

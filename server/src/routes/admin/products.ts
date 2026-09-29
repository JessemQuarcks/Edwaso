import { Router } from 'express';
import type { FilterQuery, Types } from 'mongoose';
import { z } from 'zod';
import Order from '../../models/Order.js';
import Product, { type IProduct } from '../../models/Product.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { audit, snapshot } from '../../lib/audit.js';
import { escapeRegex } from '../../lib/text.js';
import { COMPLETED, LOW_STOCK_THRESHOLD } from './stats.js';

const router = Router();

const cents = (label: string) =>
  z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`);

// http(s) only: z.url() alone also accepts javascript: and data: URLs.
const imageUrl = z.url({ protocol: /^https?$/, error: 'Image must be an http(s) URL' });

const productSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(200),
  description: z.string().max(5000).default(''),
  price: cents('Price'),
  image: z.union([z.literal(''), imageUrl]).default(''),
  category: z.string().trim().min(1).max(60).default('general'),
  stock: cents('Stock'),
});

// Updates accept any subset of fields, without applying the defaults.
const productUpdateSchema = productSchema
  .extend({
    description: z.string().max(5000),
    image: z.union([z.literal(''), imageUrl]),
    category: z.string().trim().min(1).max(60),
  })
  .partial();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(60).optional().catch(undefined),
  stock: z.enum(['in', 'low', 'out']).optional().catch(undefined),
  sort: z.enum(['newest', 'name', 'price_asc', 'price_desc', 'stock_asc']).catch('newest'),
});

const SORTS = {
  newest: { createdAt: -1 },
  name: { name: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  stock_asc: { stock: 1, name: 1 },
} as const;

const STOCK_FILTERS = {
  in: { stock: { $gt: LOW_STOCK_THRESHOLD } },
  low: { stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } },
  out: { stock: 0 },
} as const;

/** Units sold (paid or shipped) per product, for the given ids. */
async function unitsSold(ids: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await Order.aggregate<{ _id: Types.ObjectId; units: number }>([
    { $match: { status: { $in: COMPLETED }, 'items.product': { $in: ids } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: ids } } },
    { $group: { _id: '$items.product', units: { $sum: '$items.quantity' } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.units]));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, q, category, stock, sort } = parse(listQuery, req.query);
    const filter: FilterQuery<IProduct> = {};
    // A regex, not the text index: admins search by partial names ("hood" -> "Cotton Hoodie").
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
    if (category) filter.category = category;
    if (stock) Object.assign(filter, STOCK_FILTERS[stock]);

    const [products, total, counts] = await Promise.all([
      Product.find(filter)
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
      Promise.all([
        Product.countDocuments(),
        Product.countDocuments(STOCK_FILTERS.low),
        Product.countDocuments(STOCK_FILTERS.out),
      ]),
    ]);
    const sold = await unitsSold(products.map((p) => p._id));

    res.json({
      products: products.map((p) => ({ ...p.toObject(), sold: sold.get(p.id) ?? 0 })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      counts: { all: counts[0], low: counts[1], out: counts[2] },
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found');
    const sold = await unitsSold([product._id]);
    res.json({ product: { ...product.toObject(), sold: sold.get(product.id) ?? 0 } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const product = await Product.create(parse(productSchema, req.body));
    await audit(req, 'product.create', { entity: 'Product', entityId: product.id, after: snapshot(product) });
    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const update = parse(productUpdateSchema, req.body);
    const before = await Product.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Product not found');
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!product) throw new HttpError(404, 'Product not found');
    await audit(req, 'product.update', {
      entity: 'Product',
      entityId: product.id,
      before: snapshot(before),
      after: snapshot(product),
    });
    res.json({ product });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found');
    await audit(req, 'product.delete', { entity: 'Product', entityId: product.id, before: snapshot(product) });
    res.json({ message: 'Product deleted' });
  })
);

export default router;

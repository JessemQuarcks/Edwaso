import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import Product, { type IProduct } from '../models/Product.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();

const FIELDS = ['name', 'description', 'price', 'image', 'category', 'stock'] as const;
type ProductField = (typeof FIELDS)[number];

// Whitelist the writable fields; Mongoose validates the values.
function pick(body: unknown): Partial<Record<ProductField, unknown>> {
  const input = (body ?? {}) as Record<string, unknown>;
  return Object.fromEntries(FIELDS.filter((f) => f in input).map((f) => [f, input[f]]));
}

const toInt = (value: unknown, fallback: number): number => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInt(req.query.limit, 12), 1), 50);

    const filter: FilterQuery<IProduct> = {};
    if (typeof req.query.category === 'string' && req.query.category) {
      filter.category = req.query.category;
    }
    if (typeof req.query.q === 'string' && req.query.q) {
      filter.$text = { $search: req.query.q };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, page, pages: Math.ceil(total / limit), total });
  })
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await Product.distinct('category') });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  })
);

router.post(
  '/',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.create(pick(req.body));
    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, pick(req.body), {
      new: true,
      runValidators: true,
    });
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  })
);

router.delete(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ message: 'Product deleted' });
  })
);

export default router;

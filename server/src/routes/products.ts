import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import Category from '../models/Category.js';
import Product, { VISIBLE, type IProduct } from '../models/Product.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { parse } from '../middleware/validate.js';

// Public catalogue. Writes live under /api/admin/products.
const router = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(50).catch(12),
  category: z.string().trim().optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, category, q } = parse(listQuery, req.query);

    const filter: FilterQuery<IProduct> = { ...VISIBLE };
    if (category) filter.category = category;
    if (q) filter.$text = { $search: q };

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
    // `categories` (slugs) is kept for older clients; `items` adds display names and images.
    const used = (await Product.distinct('category', VISIBLE)) as string[];
    const details = await Category.find({ slug: { $in: used } }).sort({ sortOrder: 1, name: 1 });
    const known = new Set(details.map((c) => c.slug));
    const items = [
      ...details.map((c) => ({ slug: c.slug, name: c.name, image: c.image })),
      ...used.filter((s) => !known.has(s)).map((s) => ({ slug: s, name: s.charAt(0).toUpperCase() + s.slice(1), image: '' })),
    ];
    res.json({ categories: items.map((c) => c.slug), items });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, ...VISIBLE });
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  })
);

export default router;

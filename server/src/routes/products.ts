import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import Category from '../models/Category.js';
import Product, { VISIBLE, type IProduct } from '../models/Product.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { objectIdSchema, parse } from '../middleware/validate.js';

// Public catalogue. Writes live under /api/admin/products.
const router = Router();

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1, createdAt: -1 },
  price_desc: { price: -1, createdAt: -1 },
  name: { name: 1 },
} as const;

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(50).catch(12),
  category: z.string().trim().optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).catch('newest'),
  /** Price bounds in cents. */
  minPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
  featured: z.enum(['true']).optional().catch(undefined),
  inStock: z.enum(['true']).optional().catch(undefined),
  /** Leave one product out (e.g. "related products" on its own page). */
  exclude: objectIdSchema.optional().catch(undefined),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parse(listQuery, req.query);

    const filter: FilterQuery<IProduct> = { ...VISIBLE };
    if (q.category) filter.category = q.category;
    if (q.q) filter.$text = { $search: q.q };
    if (q.featured) filter.featured = true;
    if (q.inStock) filter.stock = { $gt: 0 };
    if (q.exclude) filter._id = { $ne: q.exclude };
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      filter.price = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(SORTS[q.sort])
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)), total });
  })
);

// `categories` (slugs) is kept for older clients; `items` adds names, a picture (the category's
// own, else one of its products') and how many products are on sale.
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const used = await Product.aggregate<{ _id: string; count: number; image: string | null }>([
      { $match: VISIBLE },
      { $sort: { featured: -1, createdAt: -1 } },
      // First product that has an image ($$REMOVE leaves image-less products out of the list).
      { $group: { _id: '$category', count: { $sum: 1 }, images: { $push: { $cond: [{ $gt: ['$image', ''] }, '$image', '$$REMOVE'] } } } },
      { $project: { count: 1, image: { $ifNull: [{ $first: '$images' }, null] } } },
    ]);
    const details = await Category.find({ slug: { $in: used.map((u) => u._id) } });
    const bySlug = new Map(details.map((c) => [c.slug, c]));
    const items = used
      .map((u) => {
        const c = bySlug.get(u._id);
        return {
          slug: u._id,
          name: c?.name ?? u._id.charAt(0).toUpperCase() + u._id.slice(1),
          description: c?.description ?? '',
          image: c?.image || u.image || '',
          count: u.count,
          sortOrder: c?.sortOrder ?? 0,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ sortOrder: _sortOrder, ...rest }) => rest);
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

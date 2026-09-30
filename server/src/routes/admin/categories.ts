import { Router } from 'express';
import { z } from 'zod';
import Category, { slugify, titleCase } from '../../models/Category.js';
import Product from '../../models/Product.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { audit, snapshot } from '../../lib/audit.js';
import { imageUrlSchema } from './products.js';

const router = Router();

/**
 * Categories used to be free text on products. Creates a Category for any slug products use
 * that doesn't have one yet, so older catalogues show up here without a migration step.
 */
export async function ensureCategories(): Promise<void> {
  const [used, existing] = await Promise.all([Product.distinct('category'), Category.distinct('slug')]);
  const missing = (used as string[]).filter((slug) => slug && !existing.includes(slug));
  if (missing.length === 0) return;
  await Category.insertMany(
    missing.map((slug) => ({ slug, name: titleCase(slug) })),
    { ordered: false }
  ).catch(() => undefined); // A concurrent request may have created some; the unique index wins.
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await ensureCategories();
    const [categories, counts] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }),
      Product.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
    ]);
    const bySlug = new Map(counts.map((c) => [c._id, c.count]));
    res.json({ categories: categories.map((c) => ({ ...c.toObject(), productCount: bySlug.get(c.slug) ?? 0 })) });
  })
);

const categorySchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(60),
  slug: z.string().trim().max(60).optional(),
  description: z.string().max(500).default(''),
  image: z.union([z.literal(''), imageUrlSchema]).default(''),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parse(categorySchema, req.body);
    const slug = slugify(input.slug || input.name);
    if (await Category.exists({ slug })) throw new HttpError(409, `A category with the slug “${slug}” already exists`);
    const category = await Category.create({ ...input, slug });
    await audit(req, 'category.create', { entity: 'Category', entityId: category.id, after: snapshot(category) });
    res.status(201).json({ category: { ...category.toObject(), productCount: 0 } });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = parse(
      categorySchema.extend({ description: z.string().max(500), image: z.union([z.literal(''), imageUrlSchema]), sortOrder: z.number().int() }).partial(),
      req.body
    );
    const category = await Category.findById(req.params.id);
    if (!category) throw new HttpError(404, 'Category not found');
    const before = snapshot(category);
    const oldSlug = category.slug;
    const newSlug = input.slug !== undefined ? slugify(input.slug) : oldSlug;
    if (newSlug !== oldSlug && (await Category.exists({ slug: newSlug }))) {
      throw new HttpError(409, `A category with the slug “${newSlug}” already exists`);
    }

    Object.assign(category, { ...input, slug: newSlug });
    await category.save();
    // Products point at the slug, so a rename carries them along.
    if (newSlug !== oldSlug) await Product.updateMany({ category: oldSlug }, { category: newSlug });
    await audit(req, 'category.update', { entity: 'Category', entityId: category.id, before, after: snapshot(category) });
    res.json({ category: { ...category.toObject(), productCount: await Product.countDocuments({ category: newSlug }) } });
  })
);

const deleteSchema = z.object({ moveTo: z.string().trim().max(60).optional() });

// A category with products can only be deleted by moving them to another one.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { moveTo } = parse(deleteSchema, req.query);
    const category = await Category.findById(req.params.id);
    if (!category) throw new HttpError(404, 'Category not found');
    const count = await Product.countDocuments({ category: category.slug });
    if (count > 0) {
      if (!moveTo) throw new HttpError(409, `Move this category’s ${count} products to another category first`);
      if (moveTo === category.slug || !(await Category.exists({ slug: moveTo }))) {
        throw new HttpError(400, 'Choose another existing category to move the products to');
      }
      await Product.updateMany({ category: category.slug }, { category: moveTo });
    }
    await category.deleteOne();
    await audit(req, 'category.delete', { entity: 'Category', entityId: category.id, before: snapshot(category), meta: { moved: count, moveTo } });
    res.status(204).end();
  })
);

export default router;

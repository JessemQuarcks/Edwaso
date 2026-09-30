import { Router } from 'express';
import type { FilterQuery, Types } from 'mongoose';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import Category, { slugify, titleCase } from '../../models/Category.js';
import Order, { SALE_STATUSES } from '../../models/Order.js';
import Product, { MAX_IMAGES, PRODUCT_STATUSES, type IProduct, type ProductDoc } from '../../models/Product.js';
import StockAdjustment from '../../models/StockAdjustment.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { objectIdSchema, parse } from '../../middleware/validate.js';
import { requireAdmin } from '../../middleware/adminSession.js';
import { audit, snapshot } from '../../lib/audit.js';
import { adjustStock } from '../../lib/inventory.js';
import { getSettings } from '../../lib/settings.js';
import { escapeRegex, toCsv } from '../../lib/text.js';

const router = Router();

const cents = (label: string) =>
  z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`);

// http(s) only: z.url() alone also accepts javascript: and data: URLs.
export const imageUrlSchema = z.url({ protocol: /^https?$/, error: 'Image must be an http(s) URL' });

const productSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(200),
  description: z.string().max(5000).default(''),
  price: cents('Price'),
  /** null clears it. */
  compareAtPrice: cents('Compare-at price').nullable().optional(),
  costPrice: cents('Cost price').nullable().optional(),
  sku: z
    .string()
    .trim()
    .max(64)
    .regex(/^[\w.-]*$/, 'SKU can only contain letters, numbers, dots, dashes and underscores')
    .optional(),
  images: z.array(imageUrlSchema).max(MAX_IMAGES, `At most ${MAX_IMAGES} images`).optional(),
  /** Legacy single image; used when `images` isn't sent. */
  image: z.union([z.literal(''), imageUrlSchema]).optional(),
  category: z.string().trim().min(1).max(60).default('general'),
  stock: cents('Stock'),
  featured: z.boolean().default(false),
  status: z.enum(PRODUCT_STATUSES).default('active'),
});

const productUpdateSchema = productSchema
  .extend({ description: z.string().max(5000), category: z.string().trim().min(1).max(60), featured: z.boolean(), status: z.enum(PRODUCT_STATUSES) })
  .partial();

type ProductInput = z.output<typeof productUpdateSchema>;

/** Resolves a typed category to a slug, creating the category the first time it's used. */
async function categorySlug(input: string): Promise<string> {
  const slug = slugify(input);
  await Category.updateOne({ slug }, { $setOnInsert: { slug, name: titleCase(slug) } }, { upsert: true });
  return slug;
}

/** Turns validated input into model fields (everything except stock, which goes through adjustStock). */
async function toFields(input: ProductInput): Promise<Partial<IProduct> & { $unset?: Record<string, 1> }> {
  const { stock: _stock, image, images, category, compareAtPrice, costPrice, sku, ...rest } = input;
  const fields: Partial<IProduct> = { ...rest };
  if (images) fields.images = images;
  else if (image !== undefined) fields.images = image ? [image] : [];
  if (category !== undefined) fields.category = await categorySlug(category);
  if (sku !== undefined) fields.sku = sku || undefined;
  if (compareAtPrice !== undefined) fields.compareAtPrice = compareAtPrice ?? undefined;
  if (costPrice !== undefined) fields.costPrice = costPrice ?? undefined;
  return fields;
}

async function assertSkuFree(sku: string | undefined, exceptId?: Types.ObjectId) {
  if (!sku) return;
  const clash = await Product.findOne({ sku: sku.toUpperCase(), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('name');
  if (clash) throw new HttpError(409, `SKU ${sku.toUpperCase()} is already used by “${clash.name}”`);
}

/** Units sold (in orders that were paid) per product, for the given ids. */
async function unitsSold(ids: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await Order.aggregate<{ _id: Types.ObjectId; units: number }>([
    { $match: { status: { $in: [...SALE_STATUSES, 'refunded'] }, 'items.product': { $in: ids } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: ids } } },
    { $group: { _id: '$items.product', units: { $sum: '$items.quantity' } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.units]));
}

async function stockFilters() {
  const { lowStockThreshold: t } = await getSettings();
  return {
    threshold: t,
    filters: {
      in: { stock: { $gt: t } },
      low: { stock: { $gt: 0, $lte: t } },
      out: { stock: 0 },
    },
  };
}

// ---- List / detail ----

const listQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(60).optional().catch(undefined),
  stock: z.enum(['in', 'low', 'out']).optional().catch(undefined),
  /** Default: everything except archived. */
  status: z.enum([...PRODUCT_STATUSES, 'all']).optional().catch(undefined),
  featured: z.enum(['true']).optional().catch(undefined),
  sort: z.enum(['newest', 'name', 'price_asc', 'price_desc', 'stock_asc']).catch('newest'),
});

const SORTS = {
  newest: { createdAt: -1 },
  name: { name: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  stock_asc: { stock: 1, name: 1 },
} as const;

const statusFilter = (status: string | undefined): FilterQuery<IProduct> =>
  status === 'all' ? {} : status ? { status } : { status: { $ne: 'archived' } };

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, q, category, stock, status, featured, sort } = parse(listQuery, req.query);
    const { threshold, filters } = await stockFilters();
    const base: FilterQuery<IProduct> = statusFilter(status);
    if (q) {
      const pattern = escapeRegex(q);
      // A regex, not the text index: admins search by partial names ("hood" -> "Cotton Hoodie").
      base.$or = [{ name: { $regex: pattern, $options: 'i' } }, { sku: { $regex: pattern, $options: 'i' } }];
    }
    if (category) base.category = category;
    if (featured) base.featured = true;
    const filter = stock ? { ...base, ...filters[stock] } : base;

    const [products, total, all, low, out, archived] = await Promise.all([
      Product.find(filter)
        .select('+costPrice')
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
      Product.countDocuments(base),
      Product.countDocuments({ ...base, ...filters.low }),
      Product.countDocuments({ ...base, ...filters.out }),
      Product.countDocuments({ status: 'archived' }),
    ]);
    const sold = await unitsSold(products.map((p) => p._id));

    res.json({
      products: products.map((p) => ({ ...p.toObject(), sold: sold.get(p.id) ?? 0 })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      counts: { all, low, out, archived },
      lowStockThreshold: threshold,
    });
  })
);

// ---- CSV export / import (declared before /:id) ----

const CSV_COLUMNS = ['sku', 'name', 'description', 'category', 'price', 'compare_at_price', 'cost_price', 'stock', 'status', 'featured', 'images'] as const;
const dollars = (c?: number | null) => (c === undefined || c === null ? '' : (c / 100).toFixed(2));

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const products = await Product.find().select('+costPrice').sort({ name: 1 }).limit(10_000);
    const rows = products.map((p) => [
      p.sku ?? '',
      p.name,
      p.description,
      p.category,
      dollars(p.price),
      dollars(p.compareAtPrice),
      dollars(p.costPrice),
      p.stock,
      p.status,
      p.featured ? 'yes' : 'no',
      p.images.join(' | '),
    ]);
    await audit(req, 'product.export', { meta: { count: rows.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv([...CSV_COLUMNS], rows));
  })
);

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be an amount like 12.99')
  .transform((v) => Math.round(parseFloat(v) * 100));
const csvRowSchema = z.object({
  sku: z.string().trim().max(64).regex(/^[\w.-]*$/, 'has invalid characters').optional().default(''),
  name: z.string().trim().max(200).optional().default(''),
  description: z.string().max(5000).optional(),
  category: z.string().trim().max(60).optional(),
  price: z.union([z.literal(''), money]).optional(),
  compare_at_price: z.union([z.literal(''), money]).optional(),
  cost_price: z.union([z.literal(''), money]).optional(),
  stock: z.union([z.literal(''), z.string().regex(/^\d+$/, 'must be a whole number').transform(Number)]).optional(),
  status: z.union([z.literal(''), z.enum(PRODUCT_STATUSES)]).optional(),
  featured: z.union([z.literal(''), z.enum(['yes', 'no', 'true', 'false'])]).optional(),
  images: z.string().optional(),
});

interface ImportPlan {
  row: number;
  action: 'create' | 'update';
  existing?: ProductDoc;
  fields: ProductInput;
}

// Rows are matched to existing products by SKU; rows without a known SKU create products.
// Nothing is written unless every row is valid. `?dryRun=1` only reports what would happen.
router.post(
  '/import',
  (req, res, next) =>
    csvUpload.single('file')(req, res, (err: unknown) =>
      next(err instanceof multer.MulterError ? new HttpError(400, 'CSV files must be 2 MB or smaller') : err)
    ),
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    if (!req.file) throw new HttpError(400, 'Choose a CSV file');
    const dryRun = req.query.dryRun === '1';

    let records: Record<string, string>[];
    try {
      records = parseCsv(req.file.buffer, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, bom: true, trim: true });
    } catch (err) {
      throw new HttpError(400, `That file isn’t valid CSV: ${(err as Error).message}`);
    }
    if (records.length === 0) throw new HttpError(400, 'The CSV has no rows');
    if (records.length > 1000) throw new HttpError(400, 'Import at most 1,000 rows at a time');

    const errors: { row: number; message: string }[] = [];
    const plans: ImportPlan[] = [];
    const seenSkus = new Set<string>();

    for (const [i, record] of records.entries()) {
      const row = i + 2; // 1-based, after the header
      const result = csvRowSchema.safeParse(record);
      if (!result.success) {
        const issue = result.error.issues[0]!;
        errors.push({ row, message: `${issue.path.join('.')} ${issue.message}` });
        continue;
      }
      const r = result.data;
      const sku = r.sku.toUpperCase();
      if (sku) {
        if (seenSkus.has(sku)) {
          errors.push({ row, message: `SKU ${sku} appears more than once` });
          continue;
        }
        seenSkus.add(sku);
      }
      const existing = sku ? await Product.findOne({ sku }).select('+costPrice') : null;
      const fields: ProductInput = {};
      if (r.name) fields.name = r.name;
      if (r.description !== undefined) fields.description = r.description;
      if (r.category) fields.category = r.category;
      if (typeof r.price === 'number') fields.price = r.price;
      if (r.compare_at_price !== undefined) fields.compareAtPrice = r.compare_at_price === '' ? null : r.compare_at_price;
      if (r.cost_price !== undefined) fields.costPrice = r.cost_price === '' ? null : r.cost_price;
      if (typeof r.stock === 'number') fields.stock = r.stock;
      if (r.status) fields.status = r.status;
      if (r.featured) fields.featured = r.featured === 'yes' || r.featured === 'true';
      if (r.images !== undefined) {
        const urls = r.images.split('|').map((u) => u.trim()).filter(Boolean);
        const bad = urls.find((u) => !imageUrlSchema.safeParse(u).success);
        if (bad || urls.length > MAX_IMAGES) {
          errors.push({ row, message: bad ? `image ${bad} is not an http(s) URL` : `at most ${MAX_IMAGES} images` });
          continue;
        }
        fields.images = urls;
      }
      if (sku) fields.sku = sku;

      if (!existing && (!fields.name || fields.price === undefined)) {
        errors.push({ row, message: 'new products need a name and a price' });
        continue;
      }
      plans.push({ row, action: existing ? 'update' : 'create', existing: existing ?? undefined, fields });
    }

    const summary = {
      rows: records.length,
      create: plans.filter((p) => p.action === 'create').length,
      update: plans.filter((p) => p.action === 'update').length,
      errors,
    };
    if (dryRun || errors.length > 0) {
      res.status(errors.length > 0 ? 400 : 200).json({ ...summary, applied: false, message: errors.length ? 'Fix the rows below and try again' : undefined });
      return;
    }

    for (const plan of plans) {
      const { stock, ...rest } = plan.fields;
      if (plan.existing) {
        plan.existing.set(await toFields(rest));
        await plan.existing.save();
        if (stock !== undefined) {
          await adjustStock({ product: plan.existing._id, delta: stock - plan.existing.stock, reason: 'import', by: user._id });
        }
      } else {
        const created = await Product.create({ ...(await toFields(rest)), stock: 0 });
        if (stock) await adjustStock({ product: created._id, delta: stock, reason: 'import', by: user._id });
      }
    }
    await audit(req, 'product.import', { meta: { create: summary.create, update: summary.update } });
    res.json({ ...summary, applied: true });
  })
);

// ---- Bulk actions ----

const bulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['archive', 'activate', 'draft', 'feature', 'unfeature']), ids: z.array(objectIdSchema).min(1).max(100) }),
  z.object({ action: z.literal('category'), ids: z.array(objectIdSchema).min(1).max(100), category: z.string().trim().min(1).max(60) }),
  z.object({
    action: z.literal('price'),
    ids: z.array(objectIdSchema).min(1).max(100),
    /** Percentage change, e.g. -10 for 10% off. */
    percent: z.number().min(-90, 'Can’t lower prices by more than 90%').max(500),
  }),
]);

router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const input = parse(bulkSchema, req.body);
    const ids = input.ids;
    let modified = 0;
    switch (input.action) {
      case 'archive':
      case 'activate':
      case 'draft': {
        const status = input.action === 'archive' ? 'archived' : input.action === 'activate' ? 'active' : 'draft';
        modified = (await Product.updateMany({ _id: { $in: ids } }, { status })).modifiedCount;
        break;
      }
      case 'feature':
      case 'unfeature':
        modified = (await Product.updateMany({ _id: { $in: ids } }, { featured: input.action === 'feature' })).modifiedCount;
        break;
      case 'category':
        modified = (await Product.updateMany({ _id: { $in: ids } }, { category: await categorySlug(input.category) })).modifiedCount;
        break;
      case 'price': {
        const factor = 1 + input.percent / 100;
        // Pipeline update so each product's own price is scaled, rounded to whole cents.
        modified = (
          await Product.updateMany({ _id: { $in: ids } }, [{ $set: { price: { $round: [{ $multiply: ['$price', factor] }, 0] } } }])
        ).modifiedCount;
        break;
      }
    }
    await audit(req, `product.bulk_${input.action}`, { meta: { ...input, modified } });
    res.json({ modified });
  })
);

// ---- Single product ----

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).select('+costPrice');
    if (!product) throw new HttpError(404, 'Product not found');
    const sold = await unitsSold([product._id]);
    res.json({ product: { ...product.toObject(), sold: sold.get(product.id) ?? 0 } });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const input = parse(productSchema, req.body);
    await assertSkuFree(input.sku);
    const product = await Product.create({ ...(await toFields(input)), stock: 0 });
    if (input.stock > 0) {
      await adjustStock({ product: product._id, delta: input.stock, reason: 'restock', note: 'Initial stock', by: user._id });
      product.stock = input.stock;
    }
    await audit(req, 'product.create', { entity: 'Product', entityId: product.id, after: snapshot(product) });
    res.status(201).json({ product });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const input = parse(productUpdateSchema, req.body);
    const product = await Product.findById(req.params.id).select('+costPrice');
    if (!product) throw new HttpError(404, 'Product not found');
    await assertSkuFree(input.sku, product._id);
    const before = snapshot(product);

    product.set(await toFields(input));
    await product.save();
    // Stock moves by the difference, atomically, so a sale landing mid-edit isn't overwritten.
    if (input.stock !== undefined && input.stock !== product.stock) {
      const after = await adjustStock({ product: product._id, delta: input.stock - product.stock, reason: 'manual', by: user._id });
      if (after !== null) product.stock = after;
    }
    await audit(req, 'product.update', { entity: 'Product', entityId: product.id, before, after: snapshot(product) });
    res.json({ product });
  })
);

// Only products that never sold can be deleted; anything else is archived so order history,
// reports and stock history keep pointing at it.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new HttpError(404, 'Product not found');
    if (await Order.exists({ 'items.product': product._id })) {
      throw new HttpError(409, 'This product has orders, so it can’t be deleted. Archive it instead.');
    }
    await product.deleteOne();
    await StockAdjustment.deleteMany({ product: product._id });
    await audit(req, 'product.delete', { entity: 'Product', entityId: product.id, before: snapshot(product) });
    res.json({ message: 'Product deleted' });
  })
);

// ---- Stock ----

const stockSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'Enter a non-zero amount'),
  reason: z.enum(['restock', 'return', 'correction', 'damaged']),
  note: z.string().trim().max(500).optional(),
});

router.post(
  '/:id/stock',
  asyncHandler(async (req, res) => {
    const { user } = requireAdmin(req);
    const { delta, reason, note } = parse(stockSchema, req.body);
    const stock = await adjustStock({ product: req.params.id!, delta, reason, note, by: user._id });
    if (stock === null) throw new HttpError(404, 'Product not found');
    await audit(req, 'product.stock', { entity: 'Product', entityId: req.params.id, meta: { delta, reason, note, stock } });
    res.json({ stock });
  })
);

const historyQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
});

router.get(
  '/:id/stock-history',
  asyncHandler(async (req, res) => {
    const { page, limit } = parse(historyQuery, req.query);
    const filter = { product: req.params.id };
    const [entries, total] = await Promise.all([
      StockAdjustment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('by', 'name')
        .populate('order', '_id'),
      StockAdjustment.countDocuments(filter),
    ]);
    res.json({ entries, page, pages: Math.max(1, Math.ceil(total / limit)), total });
  })
);

export default router;

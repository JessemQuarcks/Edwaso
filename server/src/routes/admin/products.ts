import { Router } from 'express';
import { z } from 'zod';
import Product from '../../models/Product.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { audit, snapshot } from '../../lib/audit.js';

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

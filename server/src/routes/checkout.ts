import { Router } from 'express';
import type Stripe from 'stripe';
import Product from '../models/Product.js';
import Order, { type IOrderItem } from '../models/Order.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { objectIdSchema, parse } from '../middleware/validate.js';
import { z } from 'zod';
import { getStripe } from '../config/stripe.js';

const router = Router();

const CURRENCY = process.env.CURRENCY ?? 'usd';
const MAX_LINE_ITEMS = 50;
const MAX_QUANTITY = 99;

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        quantity: z.number().int().min(1).max(MAX_QUANTITY),
      }),
      { error: 'Cart is empty' }
    )
    .min(1, 'Cart is empty')
    .max(MAX_LINE_ITEMS, 'Too many items'),
});

function parseCart(body: unknown): Map<string, number> {
  const { items } = parse(cartSchema, body ?? {});
  // Merge duplicate product ids.
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  return quantities;
}

// Creates a pending order and a Stripe Checkout Session.
// Prices always come from the database, never from the client.
router.post(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const quantities = parseCart(req.body);

    const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
    if (products.length !== quantities.size) {
      throw new HttpError(400, 'One or more products no longer exist');
    }

    const orderItems: IOrderItem[] = products.map((p) => {
      const quantity = quantities.get(p._id.toString()) ?? 0;
      if (p.stock < quantity) {
        throw new HttpError(400, `Only ${p.stock} of "${p.name}" left in stock`);
      }
      return { product: p._id, name: p.name, image: p.image, price: p.price, quantity };
    });
    const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const order = await Order.create({ user: user._id, items: orderItems, total });

    try {
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = orderItems.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: CURRENCY,
          unit_amount: i.price,
          product_data: {
            name: i.name,
            ...(i.image?.startsWith('http') ? { images: [i.image] } : {}),
          },
        },
      }));

      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB'] },
        metadata: { orderId: order._id.toString() },
        success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/cart`,
      });

      order.stripeSessionId = session.id;
      await order.save();
      res.status(201).json({ url: session.url, orderId: order._id.toString() });
    } catch (err) {
      await order.deleteOne();
      throw err;
    }
  })
);

export default router;

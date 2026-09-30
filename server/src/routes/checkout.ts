import { Router } from 'express';
import type Stripe from 'stripe';
import Product, { VISIBLE } from '../models/Product.js';
import { getSettings } from '../lib/settings.js';
import Order, { type IOrderItem } from '../models/Order.js';
import { protect, requireUser } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { objectIdSchema, parse } from '../middleware/validate.js';
import { z } from 'zod';
import { getStripe } from '../config/stripe.js';
import { syncPendingOrder } from '../lib/checkout-sync.js';

const router = Router();

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

    const settings = await getSettings();
    // Drafts and archived products can't be bought, even from a stale cart.
    const products = await Product.find({ _id: { $in: [...quantities.keys()] }, ...VISIBLE }).select('+costPrice');
    if (products.length !== quantities.size) {
      throw new HttpError(400, 'One or more products no longer exist');
    }

    const orderItems: IOrderItem[] = products.map((p) => {
      const quantity = quantities.get(p._id.toString()) ?? 0;
      if (p.stock < quantity) {
        throw new HttpError(400, `Only ${p.stock} of "${p.name}" left in stock`);
      }
      return { product: p._id, name: p.name, image: p.image, sku: p.sku, price: p.price, costPrice: p.costPrice, quantity };
    });
    const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const order = await Order.create({ user: user._id, items: orderItems, total, currency: settings.currency });

    try {
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = orderItems.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: settings.currency,
          unit_amount: i.price,
          product_data: {
            name: i.name,
            // Stripe fetches the image itself, so only public https URLs are useful.
            ...(i.image?.startsWith('https://') ? { images: [i.image] } : {}),
          },
        },
      }));

      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: lineItems,
        shipping_address_collection: {
          allowed_countries: settings.shippingCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        },
        ...(settings.automaticTax ? { automatic_tax: { enabled: true } } : {}),
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

const confirmSchema = z.object({ sessionId: z.string().trim().min(1).max(255) });

/**
 * Called by the success page after Stripe redirects back. Confirms the payment with Stripe
 * directly, so the order is marked paid even if the webhook is delayed or can't reach the API.
 */
router.post(
  '/confirm',
  protect,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { sessionId } = parse(confirmSchema, req.body);
    const found = await Order.findOne({ stripeSessionId: sessionId, user: user._id });
    if (!found) throw new HttpError(404, 'Order not found');
    const { order, checkoutUrl } = await syncPendingOrder(found);
    res.json({ order: { _id: order.id, status: order.status, total: order.total, currency: order.currency }, checkoutUrl });
  })
);

export default router;

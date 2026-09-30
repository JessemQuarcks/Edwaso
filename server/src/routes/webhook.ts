import type { RequestHandler } from 'express';
import type Stripe from 'stripe';
import { syncRefunds } from '../lib/payments.js';
import { handleExpired, handlePaid } from '../lib/checkout-sync.js';
import { webhookFailed, webhookSucceeded } from '../lib/notify.js';
import { getStripe } from '../config/stripe.js';

// Mounted with express.raw() in index.ts: Stripe signature verification needs the exact raw body.
export const stripeWebhook: RequestHandler = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (typeof signature !== 'string' || !secret) {
    res.status(400).send('Missing signature or webhook secret');
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handlePaid(event.data.object);
    } else if (event.type === 'charge.refunded') {
      await syncRefunds(event.data.object);
    } else if (event.type === 'checkout.session.expired') {
      await handleExpired(event.data.object.metadata?.orderId);
    }
    await webhookSucceeded(event.id);
    res.json({ received: true });
  } catch (err) {
    // A non-2xx response makes Stripe retry the event.
    console.error('Webhook handler error:', err);
    await webhookFailed(event, err);
    res.status(500).send('Webhook handler failed');
  }
};

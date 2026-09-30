import { Router } from 'express';
import type Stripe from 'stripe';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import Order, { SALE_STATUSES } from '../../models/Order.js';
import Transaction, { TRANSACTION_TYPES, type ITransaction } from '../../models/Transaction.js';
import { getStripe } from '../../config/stripe.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { parse } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { toCsv } from '../../lib/text.js';
import { buckets, MONGO_FORMAT, percentChange, rangeQuerySchema, resolveRange, type Range } from '../../lib/timeseries.js';

// Money, from the ledger (models/Transaction.ts) rather than order totals: this is what
// actually moved through Stripe, including fees and refunds.
const router = Router();

interface LedgerTotals {
  gross: number;
  fees: number;
  refunds: number;
  net: number;
  payments: number;
}

async function ledgerTotals(from: Date, to: Date): Promise<LedgerTotals> {
  const rows = await Transaction.aggregate<{ _id: string; amount: number; fee: number; net: number; count: number }>([
    { $match: { occurredAt: { $gte: from, $lt: to } } },
    { $group: { _id: '$type', amount: { $sum: '$amount' }, fee: { $sum: '$fee' }, net: { $sum: '$net' }, count: { $sum: 1 } } },
  ]);
  const payment = rows.find((r) => r._id === 'payment');
  const refund = rows.find((r) => r._id === 'refund');
  return {
    gross: payment?.amount ?? 0,
    fees: (payment?.fee ?? 0) + (refund?.fee ?? 0),
    refunds: -(refund?.amount ?? 0),
    net: (payment?.net ?? 0) + (refund?.net ?? 0),
    payments: payment?.count ?? 0,
  };
}

/** Gross margin on items that have a cost price. `coverage` is the share of item revenue that had one. */
async function margin(from: Date, to: Date) {
  const [row] = await Order.aggregate<{ revenue: number; costedRevenue: number; cost: number }>([
    { $match: { status: { $in: SALE_STATUSES }, paidAt: { $gte: from, $lt: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: null,
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        costedRevenue: {
          $sum: { $cond: [{ $gt: ['$items.costPrice', null] }, { $multiply: ['$items.price', '$items.quantity'] }, 0] },
        },
        cost: { $sum: { $multiply: [{ $ifNull: ['$items.costPrice', 0] }, '$items.quantity'] } },
      },
    },
  ]);
  const revenue = row?.revenue ?? 0;
  const costedRevenue = row?.costedRevenue ?? 0;
  const cost = row?.cost ?? 0;
  return {
    grossProfit: costedRevenue - cost,
    marginPercent: costedRevenue ? ((costedRevenue - cost) / costedRevenue) * 100 : null,
    coveragePercent: revenue ? (costedRevenue / revenue) * 100 : null,
  };
}

async function ledgerSeries(range: Range) {
  const format = MONGO_FORMAT[range.unit];
  const rows = await Transaction.aggregate<{ _id: string; gross: number; refunds: number; fees: number; net: number }>([
    { $match: { occurredAt: { $gte: range.from, $lt: range.to } } },
    {
      $group: {
        _id: { $dateToString: { format, date: '$occurredAt', timezone: range.tz } },
        gross: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
        refunds: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, 0] } },
        fees: { $sum: '$fee' },
        net: { $sum: '$net' },
      },
    },
  ]);
  const byKey = new Map(rows.map((r) => [r._id, r]));
  return buckets(range.from, range.to, range.unit, range.tz).map((b) => {
    const r = byKey.get(b.key);
    return { key: b.key, start: b.start.toISOString(), gross: r?.gross ?? 0, refunds: r?.refunds ?? 0, fees: r?.fees ?? 0, net: r?.net ?? 0 };
  });
}

async function rangeFor(query: unknown): Promise<Range> {
  const q = parse(rangeQuerySchema, query);
  let earliest: Date | null = null;
  if (!q.from) earliest = (await Transaction.findOne().sort({ occurredAt: 1 }).select('occurredAt'))?.occurredAt ?? null;
  try {
    return resolveRange(q, earliest);
  } catch (err) {
    if (err instanceof RangeError) throw new HttpError(400, err.message);
    throw err;
  }
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const range = await rangeFor(req.query);
    const { from, to, previous } = range;
    const [cur, prev, series, marginNow] = await Promise.all([
      ledgerTotals(from, to),
      previous ? ledgerTotals(previous.from, previous.to) : undefined,
      ledgerSeries(range),
      margin(from, to),
    ]);
    const kpi = (key: keyof LedgerTotals) => ({ value: cur[key], previous: prev?.[key] ?? null, change: percentChange(cur[key], prev?.[key]) });
    res.json({
      range: { from, to, unit: range.unit, tz: range.tz, previous: previous ?? null },
      kpis: { gross: kpi('gross'), fees: kpi('fees'), refunds: kpi('refunds'), net: kpi('net') },
      refundRate: cur.gross ? (cur.refunds / cur.gross) * 100 : null,
      feeRate: cur.gross ? (cur.fees / cur.gross) * 100 : null,
      margin: marginNow,
      series,
    });
  })
);

const ledgerQuery = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
  from: z.coerce.date().optional().catch(undefined),
  to: z.coerce.date().optional().catch(undefined),
});

const ledgerFilter = (q: z.output<typeof ledgerQuery>): FilterQuery<ITransaction> => ({
  ...(q.type ? { type: q.type } : {}),
  ...(q.from || q.to ? { occurredAt: { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) } } : {}),
});

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const q = parse(ledgerQuery, req.query);
    const filter = ledgerFilter(q);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ occurredAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate({ path: 'order', select: 'user total status', populate: { path: 'user', select: 'name email' } }),
      Transaction.countDocuments(filter),
    ]);
    res.json({ transactions, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)), total });
  })
);

router.get(
  '/transactions/export',
  asyncHandler(async (req, res) => {
    const q = parse(ledgerQuery, req.query);
    const rows = await Transaction.find(ledgerFilter(q)).sort({ occurredAt: -1 }).limit(20_000);
    const money = (c: number) => (c / 100).toFixed(2);
    await audit(req, 'finance.export', { meta: { count: rows.length, type: q.type } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(
      toCsv(
        ['date', 'type', 'order_id', 'stripe_id', 'currency', 'gross', 'fee', 'net'],
        rows.map((t) => [t.occurredAt.toISOString(), t.type, t.order.toString(), t.stripeId, t.currency, money(t.amount), money(t.fee), money(t.net)])
      )
    );
  })
);

// ---- Payouts (live from Stripe) ----

function stripeOrUnavailable(): Stripe {
  try {
    return getStripe();
  } catch {
    throw new HttpError(503, 'Stripe isn’t configured on the server (STRIPE_SECRET_KEY), so payouts can’t be shown.');
  }
}

const stripeError = (err: unknown): never => {
  if (err instanceof HttpError) throw err;
  throw new HttpError(502, `Stripe: ${(err as { message?: string }).message ?? 'request failed'}`);
};

router.get(
  '/payouts',
  asyncHandler(async (_req, res) => {
    const stripe = stripeOrUnavailable();
    const payouts = await stripe.payouts.list({ limit: 20 }).catch(stripeError);
    res.json({
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrivalDate: new Date(p.arrival_date * 1000),
        createdAt: new Date(p.created * 1000),
        method: p.method,
        description: p.description,
      })),
    });
  })
);

// Which of the payout's balance transactions the ledger knows about. Anything unmatched is
// money Stripe moved that the store didn't record (e.g. a refund issued outside the admin
// before webhooks were set up), or Stripe's own adjustments.
router.get(
  '/payouts/:id',
  asyncHandler(async (req, res) => {
    const stripe = stripeOrUnavailable();
    const payout = await stripe.payouts.retrieve(req.params.id!).catch(stripeError);
    const items: Stripe.BalanceTransaction[] = [];
    for await (const bt of stripe.balanceTransactions.list({ payout: payout.id, limit: 100 })) {
      if (bt.type === 'payout') continue; // the payout itself
      items.push(bt);
      if (items.length >= 1000) break;
    }

    const btIds = items.map((b) => b.id);
    const sources = items.map((b) => (typeof b.source === 'string' ? b.source : b.source?.id)).filter(Boolean) as string[];
    const known = await Transaction.find({ $or: [{ balanceTransactionId: { $in: btIds } }, { chargeId: { $in: sources } }, { stripeId: { $in: sources } }] }).select(
      'balanceTransactionId chargeId stripeId order type'
    );
    const match = (bt: Stripe.BalanceTransaction) => {
      const source = typeof bt.source === 'string' ? bt.source : bt.source?.id;
      return known.find((t) => t.balanceTransactionId === bt.id || (source && (t.chargeId === source || t.stripeId === source)));
    };

    const rows = items.map((bt) => {
      const t = match(bt);
      return {
        id: bt.id,
        type: bt.type,
        amount: bt.amount,
        fee: bt.fee,
        net: bt.net,
        createdAt: new Date(bt.created * 1000),
        orderId: t?.order.toString() ?? null,
        matched: !!t,
      };
    });
    res.json({
      payout: { id: payout.id, amount: payout.amount, currency: payout.currency, status: payout.status, arrivalDate: new Date(payout.arrival_date * 1000) },
      transactions: rows,
      matched: rows.filter((r) => r.matched).length,
      unmatched: rows.filter((r) => !r.matched).length,
      totalNet: rows.reduce((s, r) => s + r.net, 0),
    });
  })
);

export default router;

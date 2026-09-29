// Demo sales history for trying out the admin dashboard. Run from server/:
//
//   npm run demo -- seed [--months 14]   add demo customers and orders
//   npm run demo -- clear                remove everything this script added
//
// Demo customers use the @demo.shop.test domain; `clear` deletes them and their orders and
// touches nothing else. Orders reference your existing products (run `npm run seed` first
// if there are none) but never change their stock.
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/db.js';
import Order, { type OrderStatus } from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { randomToken } from '../lib/crypto.js';

const DEMO_DOMAIN = 'demo.shop.test';
const DEMO_EMAIL = new RegExp(`@${DEMO_DOMAIN.replace(/\./g, '\\.')}$`);
const DAY = 86_400_000;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { months: { type: 'string', default: '14' } },
});

// Deterministic PRNG so every run produces the same-looking history.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20260929);
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** Poisson-distributed count (Knuth), for a natural-looking number of orders per day. */
function poisson(mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit);
  return k - 1;
}

const FIRST = ['Ava', 'Liam', 'Noah', 'Emma', 'Kofi', 'Ama', 'Yaw', 'Esi', 'Mia', 'Lucas', 'Zara', 'Omar', 'Chloe', 'Ethan', 'Nia', 'Kwame', 'Sofia', 'Leo', 'Aisha', 'Jonah'];
const LAST = ['Mensah', 'Smith', 'Owusu', 'Garcia', 'Boateng', 'Chen', 'Adjei', 'Patel', 'Asante', 'Brown', 'Nkrumah', 'Silva', 'Osei', 'Kim', 'Darko'];
const CITIES = [
  { city: 'Accra', country: 'GH' },
  { city: 'London', country: 'GB' },
  { city: 'Toronto', country: 'CA' },
  { city: 'New York', country: 'US' },
  { city: 'Austin', country: 'US' },
  { city: 'Manchester', country: 'GB' },
];

async function seed(): Promise<void> {
  const months = Math.min(Math.max(Number(values.months) || 14, 1), 36);
  const products = await Product.find().select('name image price');
  if (products.length === 0) throw new Error('No products yet. Run `npm run seed` first.');
  if (await User.exists({ email: DEMO_EMAIL })) {
    throw new Error('Demo data already exists. Run `npm run demo -- clear` first to regenerate it.');
  }

  const now = Date.now();
  const start = now - months * 30 * DAY;

  // Customers join throughout the period; one bcrypt hash is shared since nobody signs in as them.
  const password = await bcrypt.hash(randomToken(), 12);
  const customerCount = 40 + months * 4;
  const customers = Array.from({ length: customerCount }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    // Skewed early, so the store has regulars by the recent months.
    const joined = new Date(start + Math.pow(random(), 1.6) * (now - start - 2 * DAY));
    return {
      _id: new Types.ObjectId(),
      name: `${first} ${last}`,
      email: `${first}.${last}.${i}@${DEMO_DOMAIN}`.toLowerCase(),
      password,
      role: 'customer' as const,
      status: 'active' as const,
      tokenVersion: 0,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      totpEnabled: false,
      recoveryCodes: [],
      createdAt: joined,
      updatedAt: joined,
    };
  });
  await User.collection.insertMany(customers);

  const orders = [];
  for (let day = start; day < now; day += DAY) {
    const progress = (day - start) / (now - start);
    const weekday = new Date(day).getDay();
    // Growth over the period, busier weekends, and a lift around November/December.
    const month = new Date(day).getMonth();
    const seasonal = month === 10 || month === 11 ? 1.6 : 1;
    const mean = (1.5 + progress * 5) * (weekday === 0 || weekday === 6 ? 1.35 : 1) * seasonal;

    for (let n = poisson(mean); n > 0; n--) {
      const createdAt = new Date(day + random() * DAY);
      if (createdAt.getTime() > now) continue;
      const eligible = customers.filter((c) => c.createdAt <= createdAt);
      if (eligible.length === 0) continue;
      const customer = pick(eligible);

      const lines = new Map<string, { product: Types.ObjectId; name: string; image?: string; price: number; quantity: number }>();
      for (let i = between(1, 3); i > 0; i--) {
        const p = pick(products);
        const existing = lines.get(p.id);
        if (existing) existing.quantity += 1;
        else lines.set(p.id, { product: p._id, name: p.name, image: p.image, price: p.price, quantity: between(1, 2) });
      }
      const items = [...lines.values()];
      const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

      const ageDays = (now - createdAt.getTime()) / DAY;
      const roll = random();
      let status: OrderStatus;
      if (ageDays < 1 && roll < 0.12) status = 'pending'; // abandoned or in-progress checkouts
      else if (roll < 0.05) status = 'cancelled';
      else if (ageDays < 4) status = roll < 0.55 ? 'paid' : 'shipped';
      else status = 'shipped';

      const paidAt = status === 'pending' ? undefined : new Date(createdAt.getTime() + between(1, 4) * 60_000);
      const history: { status: OrderStatus; at: Date; note?: string }[] = [];
      if (paidAt) history.push({ status: 'paid', at: paidAt, note: 'Payment received' });
      if (status === 'shipped' && paidAt) history.push({ status: 'shipped', at: new Date(paidAt.getTime() + between(4, 60) * 3_600_000) });
      if (status === 'cancelled' && paidAt) history.push({ status: 'cancelled', at: new Date(paidAt.getTime() + between(1, 24) * 3_600_000), note: 'Customer request' });
      const updatedAt = history.at(-1)?.at ?? createdAt;

      const place = pick(CITIES);
      orders.push({
        _id: new Types.ObjectId(),
        user: customer._id,
        items,
        total,
        status,
        stripeSessionId: `cs_demo_${randomToken(12)}`,
        paidAt,
        shippingAddress: paidAt
          ? { name: customer.name, line1: `${between(1, 240)} Market Street`, city: place.city, postalCode: String(between(10000, 99999)), country: place.country }
          : undefined,
        statusHistory: history,
        createdAt,
        updatedAt: updatedAt > new Date(now) ? new Date(now) : updatedAt,
      });
    }
  }
  if (orders.length > 0) await Order.collection.insertMany(orders);
  console.log(`Added ${customers.length} demo customers and ${orders.length} orders over ${months} months.`);
  console.log('Remove them any time with: npm run demo -- clear');
}

async function clear(): Promise<void> {
  const ids = (await User.find({ email: DEMO_EMAIL }).select('_id')).map((u) => u._id);
  const orders = await Order.deleteMany({ user: { $in: ids } });
  const users = await User.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${users.deletedCount} demo customers and ${orders.deletedCount} orders.`);
}

const COMMANDS: Record<string, () => Promise<void>> = { seed, clear };
const run = positionals[0] ? COMMANDS[positionals[0]] : undefined;
if (!run) {
  console.error('Usage: npm run demo -- <seed|clear> [--months 14]');
  process.exit(1);
}

await connectDB();
try {
  await run();
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

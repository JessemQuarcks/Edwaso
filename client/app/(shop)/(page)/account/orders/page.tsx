'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ArrowLeft, ArrowRight, CreditCard, ExternalLink, Loader2, Package, PackageCheck, RotateCcw, Search, Truck, Wallet, XCircle } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { cn } from '@/lib/utils';
import { groupOf, itemCount, longDate, orderNumber, reachedAt, statusLine, type OrderGroup } from '@/lib/customer-orders';
import { useBuyAgain } from '@/lib/use-buy-again';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderTracker from '@/components/store/OrderTracker';
import ProductImage from '@/components/store/ProductImage';
import { EASE_OUT, RevealGroup, RevealItem } from '@/components/store/motion';
import type { Order, OrdersResponse } from '@/types';

type Tab = 'active' | 'delivered' | 'closed' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'On the way' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'closed', label: 'Cancelled & refunded' },
  { id: 'all', label: 'All orders' },
];

export default function AccountOrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <Orders />
    </Suspense>
  );
}

function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-10 rounded-full" />
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-3xl" />
      ))}
    </div>
  );
}

function Orders() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api<OrdersResponse>('/orders/mine', { auth: true })
      .then((d) => setOrders(d.orders))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const groups = useMemo(() => {
    const g: Record<OrderGroup, Order[]> = { awaiting: [], active: [], delivered: [], closed: [] };
    for (const o of orders ?? []) g[groupOf(o)].push(o);
    return g;
  }, [orders]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <OrdersBackButton />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!orders) return <OrdersSkeleton />;

  const placed = orders.filter((o) => o.status !== 'pending');
  if (placed.length === 0 && groups.awaiting.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed py-16 text-center">
        <OrdersBackButton />
        <Package className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No orders yet</p>
          <p className="text-sm text-muted-foreground">When you place an order, you can follow it here, from payment to your door.</p>
        </div>
        <Link href="/shop" className={buttonVariants({ className: 'rounded-full' })}>
          Start shopping
        </Link>
      </div>
    );
  }

  const counts: Record<Tab, number> = {
    active: groups.active.length,
    delivered: groups.delivered.length,
    closed: groups.closed.length,
    all: placed.length,
  };
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && TABS.some((t) => t.id === requested) ? requested : counts.active ? 'active' : 'all';
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  const q = query.trim().toLowerCase();
  const matches = (o: Order) => !q || o._id.slice(-8).toLowerCase().includes(q.replace(/^#/, '')) || o.items.some((i) => i.name.toLowerCase().includes(q));
  const list = (tab === 'all' ? placed : groups[tab]).filter(matches);

  const spent = placed.reduce((sum, o) => sum + o.total - (o.amountRefunded ?? 0), 0);
  const stats = [
    { label: 'Orders placed', value: String(placed.length), icon: Package },
    { label: 'On the way', value: String(groups.active.length), icon: Truck },
    { label: 'Delivered', value: String(groups.delivered.length), icon: PackageCheck },
    { label: 'Total spent', value: formatPrice(spent), icon: Wallet },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <OrdersBackButton />
          <h2 className="text-2xl font-semibold tracking-tight">Orders & tracking</h2>
          <p className="text-sm text-muted-foreground">Follow what’s on its way and look back at everything you’ve bought.</p>
        </div>
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search orders</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order number or product"
            className="h-10 w-full rounded-full border bg-transparent pr-4 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </label>
      </div>

      <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <RevealItem key={label}>
            <div className="flex items-center gap-3 rounded-2xl border p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      {groups.awaiting.map((o) => (
        <AwaitingPayment key={o._id} order={o} />
      ))}

      <div role="tablist" aria-label="Filter orders" className="flex gap-1 overflow-x-auto rounded-full border p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.id ? 'text-background' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === t.id && <motion.span layoutId="orders-tab" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{t.label}</span>
            <span className={cn('relative rounded-full px-1.5 text-xs tabular-nums', tab === t.id ? 'bg-background/20' : 'bg-muted')}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${tab}-${q}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          role="tabpanel"
        >
          {list.length === 0 ? (
            <EmptyTab tab={tab} searching={!!q} />
          ) : tab === 'active' ? (
            <RevealGroup className="flex flex-col gap-4">
              {list.map((o) => (
                <ActiveOrderCard key={o._id} order={o} />
              ))}
            </RevealGroup>
          ) : (
            <History orders={list} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function OrdersBackButton() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function Thumbs({ order, size = 'size-12' }: { order: Order; size?: string }) {
  return (
    <div className="flex shrink-0 -space-x-3">
      {order.items.slice(0, 3).map((item) => (
        <span key={`${item.product}-${item.name}`} className={cn('relative overflow-hidden rounded-xl border-2 border-background bg-muted', size)}>
          <ProductImage src={item.image} alt="" sizes="56px" />
        </span>
      ))}
      {order.items.length > 3 && (
        <span className={cn('relative flex items-center justify-center rounded-xl border-2 border-background bg-muted text-xs font-medium', size)}>
          +{order.items.length - 3}
        </span>
      )}
    </div>
  );
}

function AwaitingPayment({ order }: { order: Order }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-4 rounded-3xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
        <CreditCard className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Payment not finished for {orderNumber(order._id)} · {formatPrice(order.total, order.currency)}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {order.items.map((i) => i.name).join(', ')}. Nothing is reserved until you pay.
        </p>
      </div>
      {order.checkoutUrl && (
        <a href={order.checkoutUrl} className={buttonVariants({ className: 'rounded-full' })}>
          Complete payment <ArrowRight />
        </a>
      )}
    </motion.div>
  );
}

function ActiveOrderCard({ order }: { order: Order }) {
  const f = order.fulfillment;
  return (
    <RevealItem>
      <article className="flex flex-col gap-5 rounded-3xl border p-5 transition-shadow hover:shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Thumbs order={order} size="size-14" />
            <div className="min-w-0">
              <p className="font-semibold">
                {orderNumber(order._id)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {itemCount(order)} {itemCount(order) === 1 ? 'item' : 'items'} · {formatPrice(order.total, order.currency)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{statusLine(order)}</p>
            </div>
          </div>
          <OrderStatusBadge status={order.status} customer />
        </header>

        <OrderTracker order={order} compact />

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Placed {longDate(order.createdAt)}
            {order.shippingAddress?.city ? ` · delivering to ${order.shippingAddress.city}` : ''}
            {f?.trackingNumber ? ` · tracking ${f.trackingNumber}` : ''}
          </p>
          <div className="flex gap-2">
            {f?.trackingUrl && (
              <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm', className: 'rounded-full' })}>
                <Truck /> Track parcel <ExternalLink className="size-3" />
              </a>
            )}
            <Link href={`/account/orders/${order._id}`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}>
              Details
            </Link>
          </div>
        </footer>
      </article>
    </RevealItem>
  );
}

/** Delivered, cancelled and refunded orders, grouped by month. */
function History({ orders }: { orders: Order[] }) {
  const { buyAgain, busy, notice } = useBuyAgain();
  // Newest first, by when it was delivered (or placed, for cancelled and refunded orders).
  const when = (o: Order) => reachedAt(o, 'delivered') ?? o.createdAt;
  const sorted = [...orders].sort((a, b) => when(b).localeCompare(when(a)));
  const months = new Map<string, Order[]>();
  for (const o of sorted) {
    const at = when(o);
    const key = new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), o]);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...months].map(([month, list]) => (
        <section key={month} className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{month}</h3>
          <RevealGroup className="divide-y rounded-3xl border">
            {list.map((o) => (
              <RevealItem key={o._id}>
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <Thumbs order={o} />
                  <Link href={`/account/orders/${o._id}`} className="group min-w-0 flex-1">
                    <p className="font-medium group-hover:underline">
                      {orderNumber(o._id)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">{statusLine(o)}</span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{o.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(', ')}</p>
                    {notice?.orderId === o._id && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{notice.text}</p>}
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <OrderStatusBadge status={o.status} customer partiallyRefunded={!!o.amountRefunded && o.status === 'delivered'} />
                      <span className="text-sm font-semibold tabular-nums">{formatPrice(o.total, o.currency)}</span>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full" disabled={busy !== null} onClick={() => void buyAgain(o)}>
                      {busy === o._id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Buy again
                    </Button>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>
      ))}
    </div>
  );
}

function EmptyTab({ tab, searching }: { tab: Tab; searching: boolean }) {
  const copy = searching
    ? { icon: Search, title: 'No matching orders', body: 'Try another order number or product name.' }
    : tab === 'active'
      ? { icon: Truck, title: 'Nothing on the way', body: 'Orders you place show up here until they’re delivered.' }
      : tab === 'delivered'
        ? { icon: PackageCheck, title: 'No deliveries yet', body: 'Delivered orders are kept here so you can find or reorder them.' }
        : { icon: XCircle, title: 'Nothing cancelled or refunded', body: 'Good news.' };
  const Icon = copy.icon;
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-14 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium">{copy.title}</p>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
      {!searching && tab === 'active' && (
        <Link href="/shop" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}>
          Browse the shop
        </Link>
      )}
    </div>
  );
}

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, CreditCard, ExternalLink, LifeBuoy, Loader2, MapPin, Printer, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { longDate, orderNumber, statusLine } from '@/lib/customer-orders';
import { useBuyAgain } from '@/lib/use-buy-again';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import OrderTracker from '@/components/store/OrderTracker';
import ProductImage from '@/components/store/ProductImage';
import { Reveal } from '@/components/store/motion';
import { useStore } from '@/components/Providers';
import type { Order } from '@/types';

export default function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { storeName, supportEmail } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const { buyAgain, busy, notice } = useBuyAgain();

  useEffect(() => {
    api<{ order: Order }>(`/orders/${id}`, { auth: true })
      .then((d) => setOrder(d.order))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [id]);

  const back = (
    <Link href="/account/orders" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
      <ArrowLeft className="size-4" /> All orders
    </Link>
  );
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!order) return <Skeleton className="h-96 rounded-2xl" aria-busy="true" />;

  const number = orderNumber(order._id);
  const awaiting = order.status === 'pending';
  const closed = order.status === 'cancelled' || order.status === 'refunded';
  const f = order.fulfillment;
  const money = (c: number) => formatPrice(c, order.currency);
  const refunded = order.amountRefunded ?? 0;
  const helpHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Order ${number}`)}&body=${encodeURIComponent(`Hi ${storeName},\n\nAbout my order ${number}:\n\n`)}`
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hidden text-sm font-medium print:block">{storeName} · Receipt</p>
          <h2 className="text-2xl font-semibold tracking-tight">Order {number}</h2>
          <p className="text-sm text-muted-foreground">
            Placed {longDate(order.createdAt)} · {statusLine(order)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} customer className="text-sm" />
      </div>

      {!awaiting && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" className="rounded-full" disabled={busy !== null} onClick={() => void buyAgain(order)}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Buy again
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}>
            <Printer /> Print receipt
          </Button>
          {helpHref && (
            <a href={helpHref} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}>
              <LifeBuoy /> Get help with this order
            </a>
          )}
        </div>
      )}
      {notice && <p className="text-sm text-amber-700 dark:text-amber-400">{notice.text}</p>}

      {/* Where it is */}
      <Reveal>
        <div className="rounded-3xl border p-6 print:hidden">
          {awaiting ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                <CreditCard className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">You haven’t finished paying for this order</p>
                <p className="text-sm text-muted-foreground">Nothing is reserved until you pay. The checkout link stays open for 24 hours.</p>
              </div>
              {order.checkoutUrl && (
                <a href={order.checkoutUrl} className={buttonVariants({ className: 'rounded-full' })}>
                  Complete payment <ArrowRight />
                </a>
              )}
            </div>
          ) : closed ? (
            <p className="flex items-center gap-2 font-medium">
              <XCircle className="size-5 text-destructive" />
              {order.status === 'refunded' ? 'This order was refunded.' : 'This order was cancelled.'}
              {refunded ? ` ${money(refunded)} was returned to your payment method.` : ''}
            </p>
          ) : (
            <OrderTracker order={order} />
          )}
          {f?.shippedAt && !closed && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 p-4 text-sm">
              <span>
                <span className="font-medium">{f.carrier ?? 'Shipped'}</span>
                {f.trackingNumber && <span className="text-muted-foreground"> · tracking {f.trackingNumber}</span>}
              </span>
              {f.trackingUrl && (
                <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm', className: 'rounded-full' })}>
                  Track parcel <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Reveal delay={0.05}>
          <div className="rounded-3xl border">
            <ul className="divide-y">
              {order.items.map((item) => (
                <li key={`${item.product}-${item.name}`} className="flex items-center gap-4 p-4">
                  <Link href={`/products/${item.product}`} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted print:hidden">
                    <ProductImage src={item.image} alt={item.name} sizes="64px" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${item.product}`} className="font-medium hover:underline">
                      {item.name}
                    </Link>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {item.quantity} × {money(item.price)}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">{money(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1 border-t p-4">
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(order.total)}</span>
              </div>
              {refunded > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Undo2 className="size-3.5" /> Refunded
                    </span>
                    <span className="tabular-nums">−{money(refunded)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>You paid</span>
                    <span className="tabular-nums">{money(order.total - refunded)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Reveal>
        <div className="flex flex-col gap-6">
          {order.shippingAddress?.line1 && (
            <Reveal delay={0.1}>
              <div className="flex flex-col gap-2 rounded-3xl border p-5 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <MapPin className="size-4" /> {order.status === 'delivered' ? 'Delivered to' : 'Delivering to'}
                </p>
                <address className="leading-relaxed text-muted-foreground not-italic">
                  {order.shippingAddress.name && <span className="block text-foreground">{order.shippingAddress.name}</span>}
                  <span className="block">{order.shippingAddress.line1}</span>
                  {order.shippingAddress.line2 && <span className="block">{order.shippingAddress.line2}</span>}
                  <span className="block">{[order.shippingAddress.city, order.shippingAddress.postalCode].filter(Boolean).join(', ')}</span>
                  <span className="block">{order.shippingAddress.country}</span>
                </address>
              </div>
            </Reveal>
          )}
          {order.refunds && order.refunds.length > 0 && (
            <Reveal delay={0.15}>
              <div className="flex flex-col gap-2 rounded-3xl border p-5 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Undo2 className="size-4" /> Refunds
                </p>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {order.refunds.map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{longDate(r.createdAt)}</span>
                      <span className="tabular-nums">{money(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Refunds usually reach your account within 5–10 business days.</p>
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </div>
  );
}

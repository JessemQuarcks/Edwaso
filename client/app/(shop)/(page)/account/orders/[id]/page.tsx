'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, Check, CircleDollarSign, ExternalLink, MapPin, PackageCheck, PackageOpen, Truck, XCircle } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import ProductImage from '@/components/store/ProductImage';
import { EASE_OUT, Reveal } from '@/components/store/motion';
import type { Order, OrderStatus } from '@/types';

const STEPS: { status: OrderStatus; label: string; icon: typeof Truck }[] = [
  { status: 'paid', label: 'Confirmed', icon: CircleDollarSign },
  { status: 'processing', label: 'Preparing', icon: PackageOpen },
  { status: 'shipped', label: 'Shipped', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: PackageCheck },
];

const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export default function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ order: Order }>(`/orders/${id}`, { auth: true })
      .then((d) => setOrder(d.order))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [id]);

  const back = (
    <Link href="/account/orders" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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

  const cancelled = order.status === 'cancelled' || order.status === 'refunded';
  const reached = (s: OrderStatus) => order.statusHistory?.find((h) => h.status === s)?.at;
  const currentIndex = STEPS.reduce((acc, s, i) => (reached(s.status) || order.status === s.status ? i : acc), -1);
  const f = order.fulfillment;
  const money = (c: number) => formatPrice(c, order.currency);

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Order #{order._id.slice(-8).toUpperCase()}</h2>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} className="text-sm" />
      </div>

      {/* Progress tracker */}
      <Reveal>
        <div className="rounded-3xl border p-6">
          {cancelled ? (
            <p className="flex items-center gap-2 font-medium">
              <XCircle className="size-5 text-destructive" />
              {order.status === 'refunded' ? 'This order was refunded.' : 'This order was cancelled.'}
              {order.amountRefunded ? ` ${money(order.amountRefunded)} was returned to your payment method.` : ''}
            </p>
          ) : (
            <ol className="grid grid-cols-4 gap-2">
              {STEPS.map((step, i) => {
                const done = i <= currentIndex;
                const Icon = step.icon;
                return (
                  <li key={step.status} className="relative flex flex-col items-center gap-2 text-center">
                    {i > 0 && (
                      <span aria-hidden className="absolute top-5 right-1/2 left-[-50%] h-0.5 bg-muted">
                        <motion.span
                          className="block h-full origin-left bg-foreground"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: done ? 1 : 0 }}
                          transition={{ duration: 0.6, delay: 0.2 + i * 0.25, ease: EASE_OUT }}
                        />
                      </span>
                    )}
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 + i * 0.25, type: 'spring', stiffness: 400, damping: 22 }}
                      className={cn(
                        'relative z-10 flex size-10 items-center justify-center rounded-full border-2 transition-colors',
                        done ? 'border-foreground bg-foreground text-background' : 'border-muted bg-background text-muted-foreground'
                      )}
                    >
                      {done && i < currentIndex ? <Check className="size-4" /> : <Icon className="size-4" />}
                    </motion.span>
                    <span className={cn('text-xs font-medium sm:text-sm', !done && 'text-muted-foreground')}>{step.label}</span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{dateTime(reached(step.status))}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {f?.shippedAt && !cancelled && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 p-4 text-sm">
              <span>
                <span className="font-medium">{f.carrier ?? 'Shipped'}</span>
                {f.trackingNumber && <span className="text-muted-foreground"> · tracking {f.trackingNumber}</span>}
              </span>
              {f.trackingUrl && (
                <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium underline-offset-4 hover:underline">
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
                  <Link href={`/products/${item.product}`} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
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
            <div className="flex justify-between border-t p-4 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(order.total)}</span>
            </div>
          </div>
        </Reveal>
        {order.shippingAddress?.line1 && (
          <Reveal delay={0.1}>
            <div className="flex flex-col gap-2 rounded-3xl border p-5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <MapPin className="size-4" /> Delivering to
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
      </div>
    </div>
  );
}

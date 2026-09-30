'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Package } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import ProductImage from '@/components/store/ProductImage';
import { RevealGroup, RevealItem } from '@/components/store/motion';
import type { Order, OrdersResponse } from '@/types';

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<OrdersResponse>('/orders/mine', { auth: true })
      .then((d) => setOrders(d.orders))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!orders) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed py-16 text-center">
        <Package className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No orders yet</p>
          <p className="text-sm text-muted-foreground">When you place an order, you can track it here.</p>
        </div>
        <Link href="/shop" className={buttonVariants({ className: 'rounded-full' })}>
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <RevealGroup className="flex flex-col gap-3">
      {orders.map((o) => (
        <RevealItem key={o._id}>
          <Link href={`/account/orders/${o._id}`} className="group flex items-center gap-4 rounded-2xl border p-4 transition-all hover:bg-muted/40 hover:shadow-sm">
            <div className="flex -space-x-3">
              {o.items.slice(0, 3).map((item) => (
                <span key={`${item.product}-${item.name}`} className="relative size-12 overflow-hidden rounded-xl border-2 border-background bg-muted">
                  <ProductImage src={item.image} alt="" sizes="48px" />
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                #{o._id.slice(-8).toUpperCase()}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </p>
              <p className="truncate text-sm text-muted-foreground">{o.items.map((i) => i.name).join(', ')}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <OrderStatusBadge status={o.status} />
              <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

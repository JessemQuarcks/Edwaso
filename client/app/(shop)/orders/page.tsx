'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Package } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { useAuth } from '@/components/Providers';
import type { Order, OrdersResponse } from '@/types';

export default function OrdersPage() {
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    api<OrdersResponse>('/orders/mine', { auth: true })
      .then((d) => setOrders(d.orders))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [user]);

  if (!ready) return null;

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-20 text-center">
        <Package className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Log in to see your order history.</p>
        <Link href="/login?next=/orders" className={buttonVariants({ size: 'sm' })}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!orders && !error && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {orders?.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-20 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</p>
          <Link href="/" className={buttonVariants({ size: 'sm' })}>
            Start shopping
          </Link>
        </div>
      )}

      {orders?.map((order) => (
        <Card key={order._id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {new Date(order.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                #{order._id.slice(-8)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <OrderStatusBadge status={order.status} />
              <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="flex flex-col gap-2 pt-4">
            {order.items.map((item) => (
              <div key={item.product} className="flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  <span className="tabular-nums">{item.quantity}</span> × {item.name}
                </span>
                <span className="tabular-nums">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

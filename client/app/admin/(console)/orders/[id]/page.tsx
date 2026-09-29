'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, CircleDollarSign, Loader2, MapPin, PackageCheck, ShoppingCart, Truck, User, XCircle } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDateTime, formatPrice, orderNumber } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from '@/components/admin/FormError';
import { useNotifications } from '@/components/admin/AdminNotifications';
import { useToast } from '@/components/admin/Toaster';
import { Avatar, Thumb } from '@/components/admin/kit';
import { EASE_OUT, Stagger, StaggerItem } from '@/components/admin/motion';
import type { AdminOrder, OrderDetailResponse } from '@/types/admin';
import type { OrderStatus } from '@/types';

const STEP_ICON: Record<OrderStatus, typeof Truck> = {
  pending: ShoppingCart,
  paid: CircleDollarSign,
  shipped: Truck,
  cancelled: XCircle,
};

const STEP_LABEL: Record<OrderStatus, string> = {
  pending: 'Order placed',
  paid: 'Payment received',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, setData } = useAdminQuery<OrderDetailResponse>(`/orders/${id}`);

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <FormError message={error} />
      </div>
    );
  }
  if (!data) return <DetailSkeleton />;

  const { order } = data;
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Order {orderNumber(order._id)}</h2>
            <OrderStatusBadge status={order.status} className="text-sm" />
          </div>
          <p className="text-sm text-muted-foreground">Placed {formatDateTime(order.createdAt)}</p>
        </div>
      </div>

      <Actions data={data} onChange={setData} />

      <Stagger className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <StaggerItem>
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </CardTitle>
              </CardHeader>
              <ul className="divide-y">
                {order.items.map((item) => (
                  <li key={`${item.product}-${item.name}`} className="flex items-center gap-4 px-6 py-4">
                    <Thumb src={item.image} alt={item.name} className="size-12" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/products/${item.product}`} className="block truncate font-medium hover:underline">
                        {item.name}
                      </Link>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {item.quantity} × {formatPrice(item.price)}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t px-6 py-4 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(order.total)}</span>
              </div>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Timeline order={order} />
          </StaggerItem>
        </div>

        <div className="flex flex-col gap-6">
          <StaggerItem>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-4" /> Customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order.user ? (
                  <Link href={`/admin/customers/${order.user._id}`} className="-m-2 flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                    <Avatar name={order.user.name} className="size-10" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{order.user.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{order.user.email}</span>
                    </span>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">This customer’s account was deleted.</p>
                )}
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-4" /> Shipping address
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {order.shippingAddress?.line1 ? (
                  <address className="not-italic leading-relaxed">
                    {order.shippingAddress.name && <span className="block font-medium">{order.shippingAddress.name}</span>}
                    <span className="block">{order.shippingAddress.line1}</span>
                    {order.shippingAddress.line2 && <span className="block">{order.shippingAddress.line2}</span>}
                    <span className="block">
                      {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <span className="block">{order.shippingAddress.country}</span>
                  </address>
                ) : (
                  <p className="text-muted-foreground">Collected by Stripe once the order is paid.</p>
                )}
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleDollarSign className="size-4" /> Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                <p className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Paid</span>
                  <span>{order.paidAt ? formatDateTime(order.paidAt) : 'Not yet'}</span>
                </p>
                {order.stripeSessionId && (
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Stripe session</span>
                    <code className="max-w-40 truncate text-xs" title={order.stripeSessionId}>
                      {order.stripeSessionId}
                    </code>
                  </p>
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        </div>
      </Stagger>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/orders" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      All orders
    </Link>
  );
}

function Actions({ data, onChange }: { data: OrderDetailResponse; onChange: (d: OrderDetailResponse) => void }) {
  const { order, allowedTransitions } = data;
  const toast = useToast();
  const { refresh } = useNotifications();
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState('');

  if (allowedTransitions.length === 0) return null;

  async function change(status: OrderStatus) {
    setError('');
    setBusy(status);
    try {
      const body = status === 'cancelled' ? { status, note: note || undefined, restock: order.status === 'paid' && restock } : { status };
      const result = await adminApi<OrderDetailResponse>(`/orders/${order._id}/status`, { method: 'PATCH', body });
      onChange(result);
      refresh();
      setCancelling(false);
      toast(status === 'shipped' ? 'Order marked as shipped' : 'Order cancelled', {
        description: orderNumber(order._id),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {order.status === 'paid'
            ? 'Paid and ready to ship.'
            : order.status === 'pending'
              ? 'Waiting for the customer to finish paying.'
              : ''}
        </p>
        <div className="flex gap-2">
          {allowedTransitions.includes('cancelled') && !cancelling && (
            <Button variant="outline" onClick={() => setCancelling(true)}>
              <XCircle />
              Cancel order
            </Button>
          )}
          {allowedTransitions.includes('shipped') && (
            <Button onClick={() => void change('shipped')} disabled={busy !== null}>
              {busy === 'shipped' ? <Loader2 className="animate-spin" /> : <PackageCheck />}
              Mark as shipped
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {cancelling && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t pt-4">
              {order.status === 'paid' && (
                <Alert>
                  <CircleDollarSign />
                  <AlertDescription>
                    Cancelling doesn’t refund the customer. Issue the refund from your Stripe dashboard.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Label htmlFor="cancel-note">Reason (optional, visible to staff)</Label>
                <Textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </div>
              {order.status === 'paid' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-4 accent-primary" />
                  Put the items back in stock
                </label>
              )}
              <FormError message={error} />
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => void change('cancelled')} disabled={busy !== null}>
                  {busy === 'cancelled' && <Loader2 className="animate-spin" />}
                  Cancel order
                </Button>
                <Button variant="ghost" onClick={() => setCancelling(false)}>
                  Keep order
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!cancelling && <FormError message={error} />}
    </Card>
  );
}

function Timeline({ order }: { order: AdminOrder }) {
  const steps = [
    { status: 'pending' as OrderStatus, at: order.createdAt, note: undefined, by: undefined },
    ...order.statusHistory,
  ];
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative flex flex-col gap-5">
          {steps.map((step, i) => {
            const Icon = STEP_ICON[step.status];
            const last = i === steps.length - 1;
            return (
              <motion.li
                key={`${step.status}-${step.at}`}
                className="relative flex gap-3"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.35, ease: EASE_OUT }}
              >
                {!last && (
                  <motion.span
                    aria-hidden
                    className="absolute top-8 left-[15px] w-px origin-top bg-border"
                    style={{ height: 'calc(100% - 12px)' }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
                  />
                )}
                <span
                  className={cn(
                    'relative flex size-8 shrink-0 items-center justify-center rounded-full border bg-card',
                    last && 'border-transparent bg-primary text-primary-foreground'
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 pt-1 text-sm">
                  <p className="font-medium">{STEP_LABEL[step.status]}</p>
                  <p className="text-muted-foreground">
                    {formatDateTime(step.at)}
                    {step.by && <> · by {step.by.name}</>}
                  </p>
                  {step.note && step.note !== STEP_LABEL[step.status] && (
                    <p className="mt-1 rounded-md bg-muted px-2 py-1">{step.note}</p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-10 w-72 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Printer,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDateTime, formatPrice, orderNumber, timeAgo } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from '@/components/admin/FormError';
import OrderActions from '@/components/admin/OrderActions';
import { useAdmin } from '@/components/admin/AdminShell';
import { useToast } from '@/components/admin/Toaster';
import { Avatar, Thumb } from '@/components/admin/kit';
import { EASE_OUT, Stagger, StaggerItem } from '@/components/admin/motion';
import type { AdminOrder, OrderDetailResponse } from '@/types/admin';
import type { OrderStatus } from '@/types';

const STEP_ICON: Record<OrderStatus, typeof Truck> = {
  pending: ShoppingCart,
  paid: CircleDollarSign,
  processing: PackageOpen,
  shipped: Truck,
  delivered: PackageCheck,
  cancelled: XCircle,
  refunded: RotateCcw,
};

const STEP_LABEL: Record<OrderStatus, string> = {
  pending: 'Order placed',
  paid: 'Payment received',
  processing: 'Processing started',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded in full',
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
  const partlyRefunded = order.amountRefunded > 0 && !['refunded', 'cancelled'].includes(order.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Order {orderNumber(order._id)}</h2>
            <OrderStatusBadge status={order.status} partiallyRefunded={partlyRefunded} className="text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2 text-sm text-muted-foreground">Placed {formatDateTime(order.createdAt)}</span>
            <a href={`/admin/print/orders/${order._id}/invoice`} target="_blank" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <FileText /> Invoice
            </a>
            <a href={`/admin/print/orders/${order._id}/packing-slip`} target="_blank" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Printer /> Packing slip
            </a>
          </div>
        </div>
      </div>

      <OrderActions data={data} onChange={setData} />

      <Stagger className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
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
                        {item.sku && <>{item.sku} · </>}
                        {item.quantity} × {formatPrice(item.price, order.currency)}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums">{formatPrice(item.price * item.quantity, order.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-1.5 border-t px-6 py-4 text-sm">
                {order.payment?.amountTax ? (
                  <Row label="Tax" value={formatPrice(order.payment.amountTax, order.currency)} />
                ) : null}
                {order.payment?.amountShipping ? (
                  <Row label="Shipping" value={formatPrice(order.payment.amountShipping, order.currency)} />
                ) : null}
                <Row label="Total" value={formatPrice(order.payment?.amountTotal ?? order.total, order.currency)} strong />
                {order.amountRefunded > 0 && (
                  <>
                    <Row label="Refunded" value={`− ${formatPrice(order.amountRefunded, order.currency)}`} />
                    <Row label="Net after refunds" value={formatPrice(order.total - order.amountRefunded, order.currency)} strong />
                  </>
                )}
              </div>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Timeline order={order} />
          </StaggerItem>

          <StaggerItem>
            <Notes order={order} onChange={setData} />
          </StaggerItem>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
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
                  <MapPin className="size-4" /> Shipping
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {order.shippingAddress?.line1 ? (
                  <address className="not-italic leading-relaxed">
                    {order.shippingAddress.name && <span className="block font-medium">{order.shippingAddress.name}</span>}
                    <span className="block">{order.shippingAddress.line1}</span>
                    {order.shippingAddress.line2 && <span className="block">{order.shippingAddress.line2}</span>}
                    <span className="block">
                      {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode].filter(Boolean).join(', ')}
                    </span>
                    <span className="block">{order.shippingAddress.country}</span>
                  </address>
                ) : (
                  <p className="text-muted-foreground">Collected by Stripe once the order is paid.</p>
                )}
                {order.fulfillment?.shippedAt && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="font-medium">
                      {order.fulfillment.carrier ?? 'Shipped'}
                      {order.fulfillment.trackingNumber && <span className="font-normal text-muted-foreground"> · {order.fulfillment.trackingNumber}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Shipped {formatDateTime(order.fulfillment.shippedAt)}
                      {order.fulfillment.deliveredAt && <> · delivered {formatDateTime(order.fulfillment.deliveredAt)}</>}
                    </p>
                    {order.fulfillment.trackingUrl && (
                      <a href={order.fulfillment.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline">
                        Track parcel <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
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
                <Row label="Paid" value={order.paidAt ? formatDateTime(order.paidAt) : 'Not yet'} />
                {order.payment?.fee !== undefined && (
                  <>
                    <Row label="Stripe fee" value={`− ${formatPrice(order.payment.fee, order.currency)}`} />
                    <Row label="Net payout" value={formatPrice(order.payment.net ?? 0, order.currency)} strong />
                  </>
                )}
                {order.payment?.paymentIntentId && (
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Payment</span>
                    <code className="max-w-44 truncate text-xs" title={order.payment.paymentIntentId}>
                      {order.payment.paymentIntentId}
                    </code>
                  </p>
                )}
                {order.refunds.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t pt-3">
                    <p className="font-medium">Refunds</p>
                    {order.refunds.map((r) => (
                      <div key={r.refundId} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-xs text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                          {r.by && <> · {r.by.name}</>}
                          {r.reason && <span className="block truncate">{r.reason}</span>}
                        </span>
                        <span className="tabular-nums">− {formatPrice(r.amount, order.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        </div>
      </Stagger>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-2', strong && 'font-semibold')}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
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

function Notes({ order, onChange }: { order: AdminOrder; onChange: (d: OrderDetailResponse) => void }) {
  const admin = useAdmin();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notes = [...(order.notes ?? [])].reverse();

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      onChange(await adminApi<OrderDetailResponse>(`/orders/${order._id}/notes`, { method: 'POST', body: { body } }));
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    try {
      onChange(await adminApi<OrderDetailResponse>(`/orders/${order._id}/notes/${noteId}`, { method: 'DELETE' }));
      toast('Note deleted');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4" /> Internal notes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={add} className="flex flex-col gap-2">
          <Textarea rows={2} maxLength={2000} placeholder="Add a note for the team. Customers never see these." value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="sm" className="self-end" disabled={busy || !body.trim()}>
            {busy && <Loader2 className="animate-spin" />}
            Add note
          </Button>
        </form>
        <FormError message={error} />
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {notes.map((n) => {
              const mine = n.author?._id === admin.id;
              return (
                <motion.li
                  key={n._id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className="group flex gap-3 rounded-lg bg-muted/60 p-3 text-sm"
                >
                  <Avatar name={n.author?.name ?? '?'} className="size-7" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{n.author?.name ?? 'Former staff'}</span> · {timeAgo(n.createdAt)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
                  </div>
                  {(mine || admin.role !== 'staff') && (
                    <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void remove(n._id)} aria-label="Delete note">
                      <Trash2 />
                    </Button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </CardContent>
    </Card>
  );
}

function Timeline({ order }: { order: AdminOrder }) {
  const steps = [{ status: 'pending' as OrderStatus, at: order.createdAt, note: undefined, by: undefined }, ...order.statusHistory];
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
                transition={{ delay: 0.2 + i * 0.1, duration: 0.35, ease: EASE_OUT }}
              >
                {!last && (
                  <motion.span
                    aria-hidden
                    className="absolute top-8 left-[15px] w-px origin-top bg-border"
                    style={{ height: 'calc(100% - 12px)' }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  />
                )}
                <span className={cn('relative flex size-8 shrink-0 items-center justify-center rounded-full border bg-card', last && 'border-transparent bg-primary text-primary-foreground')}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 pt-1 text-sm">
                  <p className="font-medium">{STEP_LABEL[step.status]}</p>
                  <p className="text-muted-foreground">
                    {formatDateTime(step.at)}
                    {step.by && <> · by {step.by.name}</>}
                  </p>
                  {step.note && step.note !== STEP_LABEL[step.status] && <p className="mt-1 rounded-md bg-muted px-2 py-1">{step.note}</p>}
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

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Ban, CircleCheck, Loader2, Package, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDate, formatNumber, formatPrice, orderNumber } from '@/lib/admin-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { useToast } from '@/components/admin/Toaster';
import { Avatar, EmptyState, KpiCard } from '@/components/admin/kit';
import { rowMotion, Stagger, StaggerItem } from '@/components/admin/motion';
import type { CustomerDetailResponse } from '@/types/admin';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const admin = useAdmin();
  const toast = useToast();
  const { data, error, setData } = useAdminQuery<CustomerDetailResponse>(`/customers/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const back = (
    <Link href="/admin/customers" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      All customers
    </Link>
  );

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <FormError message={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { customer, stats, orders } = data;
  const canManage = admin.role === 'owner' || admin.role === 'admin';
  const disabled = customer.status === 'disabled';

  async function toggleStatus() {
    const next = disabled ? 'active' : 'disabled';
    if (next === 'disabled' && !confirm(`Disable ${customer.name}? They’ll be signed out and can’t sign in to the store.`)) return;
    setBusy(true);
    setActionError('');
    try {
      await adminApi(`/customers/${customer._id}/status`, { method: 'PATCH', body: { status: next } });
      setData({ ...data!, customer: { ...customer, status: next } });
      toast(next === 'disabled' ? 'Customer disabled' : 'Customer re-enabled', { description: customer.name });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {back}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {customer.name}
              <Badge variant={disabled ? 'destructive' : 'secondary'} className="capitalize">
                {customer.status}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              {customer.email} · customer since {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>
        {canManage && (
          <Button variant={disabled ? 'default' : 'outline'} onClick={() => void toggleStatus()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : disabled ? <CircleCheck /> : <Ban />}
            {disabled ? 'Re-enable account' : 'Disable account'}
          </Button>
        )}
      </motion.div>

      <FormError message={actionError} />

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <KpiCard icon={Receipt} label="Orders" value={stats.orders} format={formatNumber} />
        </StaggerItem>
        <StaggerItem>
          <KpiCard icon={Wallet} label="Total spent" value={stats.spent} format={formatPrice} />
        </StaggerItem>
        <StaggerItem>
          <KpiCard icon={ShoppingBag} label="Average order" value={stats.averageOrderValue} format={formatPrice} />
        </StaggerItem>
        <StaggerItem>
          <KpiCard icon={Package} label="Items bought" value={stats.units} format={formatNumber} />
        </StaggerItem>
      </Stagger>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        {orders.length === 0 ? (
          <EmptyState icon={Receipt} title="No orders yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o, i) => (
                  <motion.tr
                    key={o._id}
                    {...rowMotion(i)}
                    onClick={() => router.push(`/admin/orders/${o._id}`)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/admin/orders/${o._id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {orderNumber(o._id)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.items.reduce((n, it) => n + it.quantity, 0)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPrice(o.total)}</TableCell>
                    <TableCell className="pr-6">
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

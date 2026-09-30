'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft, Ban, CircleCheck, KeyRound, Loader2, Package, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import CustomerTabs from '@/components/admin/CustomerTabs';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDate, formatNumber, formatPrice } from '@/lib/admin-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { useToast } from '@/components/admin/Toaster';
import { Avatar, KpiCard } from '@/components/admin/kit';
import { Stagger, StaggerItem } from '@/components/admin/motion';
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

  async function sendReset() {
    if (!confirm(`Email ${customer.name} a link to choose a new password? The link works once and expires in an hour.`)) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await adminApi<{ email: string }>(`/customers/${customer._id}/password-reset`, { method: 'POST' });
      toast(res.email === 'failed' ? 'The email couldn’t be sent' : 'Password reset email sent', {
        description: res.email === 'logged' ? 'No email provider is set up, so it was written to the server log' : customer.email,
        variant: res.email === 'failed' ? 'error' : 'success',
      });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

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
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void sendReset()} disabled={busy || disabled}>
            <KeyRound />
            Send password reset
          </Button>
          <Button variant={disabled ? 'default' : 'outline'} onClick={() => void toggleStatus()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : disabled ? <CircleCheck /> : <Ban />}
            {disabled ? 'Re-enable account' : 'Disable account'}
          </Button>
          </div>
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

      <CustomerTabs customerId={customer._id} orders={orders} />
    </div>
  );
}

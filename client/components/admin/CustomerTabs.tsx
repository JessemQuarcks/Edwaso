'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { KeyRound, Loader2, Mail, MessageSquare, Receipt, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDate, formatDateTime, formatPrice, orderNumber, timeAgo } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from './FormError';
import { useAdmin } from './AdminShell';
import { Avatar, CountTabs, EmptyState } from './kit';
import { EASE_OUT, rowMotion } from './motion';
import type { ActivityEvent, AdminOrder, CustomerNote } from '@/types/admin';

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function CustomerTabs({ customerId, orders }: { customerId: string; orders: AdminOrder[] }) {
  const [tab, setTab] = useState<Tab>('orders');
  return (
    <Card className="gap-0 py-0">
      <div className="px-4 pt-3">
        <CountTabs label="Customer" options={TABS.map((t) => (t.id === 'orders' ? { ...t, count: orders.length } : t))} value={tab} onChange={setTab} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'orders' && <Orders orders={orders} />}
          {tab === 'activity' && <Activity customerId={customerId} />}
          {tab === 'notes' && <Notes customerId={customerId} />}
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

function Orders({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  if (orders.length === 0) return <EmptyState icon={Receipt} title="No orders yet" />;
  return (
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
            <motion.tr key={o._id} {...rowMotion(i)} onClick={() => router.push(`/admin/orders/${o._id}`)} className="cursor-pointer border-b transition-colors hover:bg-muted/50">
              <TableCell className="pl-6 font-medium">
                <Link href={`/admin/orders/${o._id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                  {orderNumber(o._id)}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
              <TableCell className="text-right tabular-nums">{o.items.reduce((n, it) => n + it.quantity, 0)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatPrice(o.total)}</TableCell>
              <TableCell className="pr-6">
                <OrderStatusBadge status={o.status} partiallyRefunded={o.amountRefunded > 0 && !['refunded', 'cancelled'].includes(o.status)} />
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const KIND_ICON = { account: UserPlus, order: Receipt, email: Mail, admin: ShieldAlert } as const;

function Activity({ customerId }: { customerId: string }) {
  const { data, error } = useAdminQuery<{ events: ActivityEvent[] }>(`/customers/${customerId}/activity`);
  if (error) return <FormError message={error} />;
  if (!data) return <Skeleton className="m-4 h-40 rounded-lg" />;
  return (
    <ol className="flex flex-col gap-4 p-6">
      {data.events.map((e, i) => {
        const Icon = e.title.includes('password') || e.title.includes('Reset') ? KeyRound : KIND_ICON[e.kind];
        return (
          <motion.li
            key={`${e.at}-${i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 15) * 0.03, duration: 0.3, ease: EASE_OUT }}
            className="flex gap-3 text-sm"
          >
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-muted', e.kind === 'admin' && 'bg-status-warning/15')}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="font-medium">
                {e.title}
                {e.amount !== undefined && <> · {formatPrice(e.amount)}</>}
                {e.orderId && (
                  <Link href={`/admin/orders/${e.orderId}`} className="ml-1.5 font-normal text-muted-foreground hover:underline">
                    {orderNumber(e.orderId)}
                  </Link>
                )}
              </p>
              <p className="text-muted-foreground">
                {formatDateTime(e.at)}
                {e.actor && <> · by {e.actor}</>}
                {e.detail && <> · {e.detail}</>}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function Notes({ customerId }: { customerId: string }) {
  const admin = useAdmin();
  const { data, error, setData } = useAdminQuery<{ notes: CustomerNote[] }>(`/customers/${customerId}/notes`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !data) return;
    setBusy(true);
    setActionError('');
    try {
      const { note } = await adminApi<{ note: CustomerNote }>(`/customers/${customerId}/notes`, { method: 'POST', body: { body } });
      setData({ notes: [note, ...data.notes] });
      setBody('');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!data) return;
    try {
      await adminApi(`/customers/${customerId}/notes/${id}`, { method: 'DELETE' });
      setData({ notes: data.notes.filter((n) => n._id !== id) });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 p-6">
      <form onSubmit={add} className="flex flex-col gap-2">
        <Textarea rows={2} maxLength={2000} placeholder="Add a note about this customer. Only staff can see it." value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" size="sm" className="self-end" disabled={busy || !body.trim()}>
          {busy && <Loader2 className="animate-spin" />}
          Add note
        </Button>
      </form>
      <FormError message={error || actionError} />
      {data?.notes.length === 0 && <EmptyState icon={MessageSquare} title="No notes yet" />}
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {data?.notes.map((n) => (
            <motion.li
              key={n._id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex gap-3 rounded-lg bg-muted/60 p-3 text-sm"
            >
              <Avatar name={n.author?.name ?? '?'} className="size-7" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{n.author?.name ?? 'Former staff'}</span> · {timeAgo(n.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
              </div>
              {(n.author?._id === admin.id || admin.role !== 'staff') && (
                <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void remove(n._id)} aria-label="Delete note">
                  <Trash2 />
                </Button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

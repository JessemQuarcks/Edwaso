'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Download, Receipt, SlidersHorizontal, X } from 'lucide-react';
import { useAdminQuery, useDebounced } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { formatDateTime, formatPrice, orderNumber } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from '@/components/admin/FormError';
import { Avatar, CountTabs, EmptyState, Pagination, SearchInput, SELECT_CLASS } from '@/components/admin/kit';
import { EASE_OUT, rowMotion } from '@/components/admin/motion';
import type { OrdersListResponse } from '@/types/admin';

const LIMIT = 20;

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'To fulfil' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'pending', label: 'Awaiting payment' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'refunded', label: 'Refunded' },
] as const;
type Tab = (typeof STATUS_TABS)[number]['id'];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'total_desc', label: 'Highest total' },
  { id: 'total_asc', label: 'Lowest total' },
];

export default function OrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}

function Orders() {
  const router = useRouter();
  const [url, setUrl] = useUrlState({ status: 'all', q: '', sort: 'newest', page: '1', from: '', to: '', min: '', max: '' });
  const filtersActive = !!(url.from || url.to || url.min || url.max);
  const [showFilters, setShowFilters] = useState(filtersActive);
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search);

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced, page: '1' });
    // Only react to the typed value settling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const status = (STATUS_TABS.some((t) => t.id === url.status) ? url.status : 'all') as Tab;
  const params = new URLSearchParams({ page: url.page, limit: String(LIMIT), sort: url.sort });
  if (status !== 'all') params.set('status', status);
  if (url.q) params.set('q', url.q);
  // Dates are whole local days; amounts are typed in the store currency and sent as cents.
  if (url.from) params.set('from', new Date(`${url.from}T00:00:00`).toISOString());
  if (url.to) params.set('to', new Date(`${url.to}T23:59:59.999`).toISOString());
  if (url.min) params.set('min', String(Math.round(parseFloat(url.min) * 100)));
  if (url.max) params.set('max', String(Math.round(parseFloat(url.max) * 100)));

  const { data, error, loading } = useAdminQuery<OrdersListResponse>(`/orders?${params}`);
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');
  exportParams.delete('limit');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by customer, email or order #"
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-2">
          <Button variant={filtersActive ? 'secondary' : 'outline'} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal />
            Filters{filtersActive && ' ·'}
          </Button>
          <select
            aria-label="Sort orders"
            className={SELECT_CLASS}
            value={url.sort}
            onChange={(e) => setUrl({ sort: e.target.value, page: '1' })}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <a href={`/api/admin/orders/export?${exportParams}`} className={buttonVariants({ variant: 'outline' })} download>
            <Download />
            Export CSV
          </a>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Placed from</span>
                <Input type="date" className="w-40" value={url.from} max={url.to || undefined} onChange={(e) => setUrl({ from: e.target.value, page: '1' })} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="w-40" value={url.to} min={url.from || undefined} onChange={(e) => setUrl({ to: e.target.value, page: '1' })} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Total at least</span>
                <Input type="number" min="0" step="0.01" placeholder="0.00" className="w-28" value={url.min} onChange={(e) => setUrl({ min: e.target.value, page: '1' })} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">at most</span>
                <Input type="number" min="0" step="0.01" placeholder="any" className="w-28" value={url.max} onChange={(e) => setUrl({ max: e.target.value, page: '1' })} />
              </label>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={() => setUrl({ from: '', to: '', min: '', max: '', page: '1' })}>
                  <X /> Clear filters
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FormError message={error} />

      <Card className="gap-0 py-0">
        <div className="px-4 pt-3">
          <CountTabs
            label="Order status"
            options={STATUS_TABS.map((t) => ({ ...t, count: data?.counts[t.id] }))}
            value={status}
            onChange={(id) => setUrl({ status: id, page: '1' })}
          />
        </div>

        {!data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : data.orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={url.q ? 'No orders match your search' : 'No orders here yet'}
            description={url.q ? 'Try a customer name, email address or order number.' : undefined}
          />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-50')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody key={params.toString()}>
                {data.orders.map((o, i) => (
                  <motion.tr
                    key={o._id}
                    {...rowMotion(i)}
                    onClick={() => router.push(`/admin/orders/${o._id}`)}
                    className="group cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/admin/orders/${o._id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {orderNumber(o._id)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAt)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={o.user?.name ?? '?'} />
                        <span className="min-w-0">
                          <span className="block max-w-48 truncate font-medium">{o.user?.name ?? 'Deleted customer'}</span>
                          <span className="block max-w-48 truncate text-xs text-muted-foreground">{o.user?.email}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.items.reduce((n, item) => n + item.quantity, 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPrice(o.total)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} partiallyRefunded={o.amountRefunded > 0 && o.status !== 'refunded' && o.status !== 'cancelled'} />
                    </TableCell>
                    <TableCell className="pr-6">
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            limit={LIMIT}
            noun="orders"
            onPage={(p) => setUrl({ page: String(p) })}
          />
        )}
      </Card>
    </div>
  );
}

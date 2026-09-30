'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ChevronRight, Download, Users } from 'lucide-react';
import { useAdminQuery, useDebounced } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { formatDate, formatNumber, formatPrice, timeAgo } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { Avatar, CountTabs, EmptyState, Pagination, SearchInput } from '@/components/admin/kit';
import { rowMotion } from '@/components/admin/motion';
import type { CustomersListResponse } from '@/types/admin';

const LIMIT = 20;
const STATUS_TABS = [
  { id: 'all', label: 'All customers' },
  { id: 'active', label: 'Active' },
  { id: 'disabled', label: 'Disabled' },
] as const;
const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'spent', label: 'Top spenders' },
  { id: 'orders', label: 'Most orders' },
  { id: 'name', label: 'Name A–Z' },
];
const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export default function CustomersPage() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const router = useRouter();
  const admin = useAdmin();
  const subscribers = useAdminQuery<{ count: number }>('/customers/subscribers/count');
  const [url, setUrl] = useUrlState({ status: 'all', q: '', sort: 'newest', page: '1' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search);

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const status = (STATUS_TABS.some((t) => t.id === url.status) ? url.status : 'all') as (typeof STATUS_TABS)[number]['id'];
  const params = new URLSearchParams({ page: url.page, limit: String(LIMIT), sort: url.sort });
  if (status !== 'all') params.set('status', status);
  if (url.q) params.set('q', url.q);
  const { data, error, loading } = useAdminQuery<CustomersListResponse>(`/customers?${params}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email" className="w-full sm:w-80" />
        <div className="flex flex-wrap items-center gap-2">
          {admin.role !== 'staff' && !!subscribers.data?.count && (
            <a href="/api/admin/customers/subscribers/export" download className={buttonVariants({ variant: 'outline' })}>
              <Download /> Newsletter list ({formatNumber(subscribers.data.count)})
            </a>
          )}
          <select
            aria-label="Sort customers"
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
        </div>
      </div>

      <FormError message={error} />

      <Card className="gap-0 py-0">
        <div className="px-4 pt-3">
          <CountTabs
            label="Customer status"
            options={STATUS_TABS}
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
        ) : data.customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={url.q ? 'No customers match your search' : 'No customers yet'}
            description={url.q ? undefined : 'Customers appear here when they create an account on the store.'}
          />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-50')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Total spent</TableHead>
                  <TableHead>Last order</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody key={`${url.page}-${status}-${url.q}-${url.sort}`}>
                {data.customers.map((c, i) => (
                  <motion.tr
                    key={c._id}
                    {...rowMotion(i)}
                    onClick={() => router.push(`/admin/customers/${c._id}`)}
                    className="group cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={c.name} />
                        <span className="min-w-0">
                          <Link
                            href={`/admin/customers/${c._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-56 truncate font-medium hover:underline"
                          >
                            {c.name}
                          </Link>
                          <span className="block max-w-56 truncate text-xs text-muted-foreground">{c.email}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.orders)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPrice(c.spent)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {c.lastOrderAt ? timeAgo(c.lastOrderAt) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'secondary' : 'destructive'} className="capitalize">
                        {c.status}
                      </Badge>
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
            noun="customers"
            onPage={(p) => setUrl({ page: String(p) })}
          />
        )}
      </Card>
    </div>
  );
}

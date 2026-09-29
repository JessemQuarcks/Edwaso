'use client';

import { Suspense, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Ban,
  Box,
  CircleCheckBig,
  PackageOpen,
  Receipt,
  Truck,
  UserPlus,
} from 'lucide-react';
import { useAdminQuery } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { DEFAULT_RANGE, isRangeId, presetFor, RANGE_PRESETS, rangeQuery, type RangeId } from '@/lib/admin-range';
import { formatDate, formatNumber, formatPrice, orderNumber } from '@/lib/admin-format';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import BestSellers from '@/components/admin/BestSellers';
import FormError from '@/components/admin/FormError';
import { ChartCard, RevenueChart, RevenueLegend, SeriesTable } from '@/components/admin/charts';
import { Avatar, DeltaPill, EmptyState, KpiCard, SearchInput, Segmented, Thumb } from '@/components/admin/kit';
import { CountUp, rowMotion, Stagger, StaggerItem } from '@/components/admin/motion';
import type { OverviewResponse } from '@/types/admin';

export default function OverviewPage() {
  return (
    <Suspense>
      <Overview />
    </Suspense>
  );
}

function Overview() {
  const [url, setUrl] = useUrlState({ range: DEFAULT_RANGE as string });
  const range: RangeId = isRangeId(url.range) ? url.range : DEFAULT_RANGE;
  const preset = presetFor(range);
  // Computed once per range selection, so "now" doesn't change the request on every render.
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading } = useAdminQuery<OverviewResponse>(`/stats/overview?${query}`);

  const comparison = preset.previous ? `vs ${preset.previous}` : 'all time';

  return (
    <div className="flex flex-col gap-6">
      {/* One filter row, scoping everything below it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Date range"
            options={RANGE_PRESETS.map((p) => ({ id: p.id, label: p.label, title: p.long }))}
            value={range}
            onChange={(id) => setUrl({ range: id })}
          />
          <span className="text-sm text-muted-foreground">
            {preset.long}
            {preset.previous && <> · compared with the {preset.previous}</>}
          </span>
        </div>
        <Link href={`/admin/analytics?range=${range}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Full analytics
          <ArrowRight />
        </Link>
      </div>

      <FormError message={error} />

      {!data ? (
        <OverviewSkeleton />
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <KpiCard
                icon={Box}
                label="Total products"
                value={data.kpis.products.value}
                format={formatNumber}
                caption={
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    +{data.kpis.products.added} new
                  </span>
                }
              />
            </StaggerItem>
            <StaggerItem>
              <KpiCard
                icon={CircleCheckBig}
                label="Completed orders"
                value={data.kpis.completedOrders.value}
                format={formatNumber}
                kpi={data.kpis.completedOrders}
              />
            </StaggerItem>
            <StaggerItem>
              <KpiCard
                icon={Ban}
                label="Cancelled orders"
                value={data.kpis.cancelledOrders.value}
                format={formatNumber}
                kpi={data.kpis.cancelledOrders}
                goodWhenUp={false}
              />
            </StaggerItem>
            <StaggerItem>
              <KpiCard
                icon={UserPlus}
                label="New customers"
                value={data.kpis.newCustomers.value}
                format={formatNumber}
                kpi={data.kpis.newCustomers}
              />
            </StaggerItem>
          </Stagger>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }}>
            <ChartCard
              title="Your sales report"
              description={`Revenue from paid orders, ${preset.long.toLowerCase()}`}
              loading={loading}
              chart={
                <div className="grid gap-6 pb-6 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-center">
                  <div className="flex flex-col gap-3">
                    <CountUp
                      value={data.kpis.revenue.value}
                      format={formatPrice}
                      className="text-4xl font-semibold tracking-tight sm:text-5xl"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <DeltaPill change={data.kpis.revenue.change} />
                      {data.kpis.revenue.previous !== null && (
                        <span>
                          {comparison} ({formatPrice(data.kpis.revenue.previous)})
                        </span>
                      )}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-muted/60 p-3">
                        <dt className="text-muted-foreground">Orders</dt>
                        <dd className="mt-0.5 text-lg font-semibold">{formatNumber(data.kpis.completedOrders.value)}</dd>
                      </div>
                      <div className="rounded-lg bg-muted/60 p-3">
                        <dt className="text-muted-foreground">Avg. order</dt>
                        <dd className="mt-0.5 text-lg font-semibold">{formatPrice(data.kpis.averageOrderValue.value)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap gap-4 text-sm">
                      <RevenueLegend hasPrevious={data.range.previous !== null} />
                    </div>
                    <RevenueChart series={data.series} unit={data.range.unit} />
                  </div>
                </div>
              }
              table={
                <SeriesTable
                  series={data.series}
                  unit={data.range.unit}
                  columns={[
                    { label: 'Revenue', value: (p) => formatPrice(p.revenue) },
                    ...(data.range.previous
                      ? [{ label: 'Previous period', value: (p: (typeof data.series)[number]) => (p.previousRevenue === null ? '—' : formatPrice(p.previousRevenue)) }]
                      : []),
                    { label: 'Orders', value: (p) => formatNumber(p.orders) },
                  ]}
                />
              }
            />
          </motion.div>

          <div className="grid gap-6 xl:grid-cols-3">
            <motion.div
              className="min-w-0 xl:col-span-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.45 }}
            >
              <LatestTransactions orders={data.recentOrders} />
            </motion.div>
            <motion.div
              className="flex min-w-0 flex-col gap-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.45 }}
            >
              <BestSellers products={data.topProducts} periodLabel={preset.long} />
              <NeedsAttention data={data} />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

function LatestTransactions({ orders }: { orders: OverviewResponse['recentOrders'] }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(q.trim() ? `/admin/orders?q=${encodeURIComponent(q.trim())}` : '/admin/orders');
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle>Latest transactions</CardTitle>
          <CardDescription>The most recent orders across every status</CardDescription>
        </div>
        <form onSubmit={search} className="flex items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search orders" className="w-48" />
          <Link href="/admin/orders" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            View all
          </Link>
        </form>
      </CardHeader>
      {orders.length === 0 ? (
        <EmptyState icon={Receipt} title="No orders yet" description="New orders will show up here as they come in." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o, i) => {
                const user = typeof o.user === 'string' ? null : o.user;
                return (
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
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Avatar name={user?.name ?? '?'} className="size-7" />
                        <span className="max-w-40 truncate">{user?.name ?? 'Deleted customer'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPrice(o.total)}</TableCell>
                    <TableCell className="pr-6">
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function NeedsAttention({ data }: { data: OverviewResponse }) {
  const nothing = data.awaitingShipment === 0 && data.lowStock.length === 0;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {nothing && <p className="text-sm text-muted-foreground">Nothing waiting on you. Nice.</p>}
        {data.awaitingShipment > 0 && (
          <Link
            href="/admin/orders?status=paid"
            className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Truck className="size-4" />
            </span>
            <span className="flex-1 text-sm">
              <span className="font-medium">{data.awaitingShipment}</span> paid{' '}
              {data.awaitingShipment === 1 ? 'order' : 'orders'} to ship
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        )}
        {data.lowStock.map((p) => (
          <Link
            key={p._id}
            href={`/admin/products/${p._id}`}
            className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted"
          >
            <Thumb src={p.image} alt={p.name} className="size-9" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
              </span>
            </span>
            <PackageOpen className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[380px] rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

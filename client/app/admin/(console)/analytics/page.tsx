'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { DollarSign, Package, Receipt, ShoppingBag, UserPlus } from 'lucide-react';
import { useAdminQuery } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { DEFAULT_RANGE, isRangeId, presetFor, RANGE_PRESETS, rangeQuery, type RangeId } from '@/lib/admin-range';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import FormError from '@/components/admin/FormError';
import {
  AovLineChart,
  ChartCard,
  HorizontalBars,
  OrdersBarChart,
  RevenueChart,
  RevenueLegend,
  SeriesTable,
} from '@/components/admin/charts';
import { Avatar, EmptyState, KpiCard, Segmented, Thumb } from '@/components/admin/kit';
import { EASE_OUT, Stagger, StaggerItem } from '@/components/admin/motion';
import type { AnalyticsResponse, SeriesPoint } from '@/types/admin';
import type { OrderStatus } from '@/types';

const STATUS_ORDER: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered', 'pending', 'cancelled', 'refunded'];
const STATUS_HELP: Record<OrderStatus, string> = {
  pending: 'Checkout started, not paid',
  paid: 'Paid, not started',
  processing: 'Being prepared',
  shipped: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled or checkout expired',
  refunded: 'Fully refunded',
};

export default function AnalyticsPage() {
  return (
    <Suspense>
      <Analytics />
    </Suspense>
  );
}

const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.45, ease: EASE_OUT },
});

function Analytics() {
  const [url, setUrl] = useUrlState({ range: DEFAULT_RANGE as string });
  const range: RangeId = isRangeId(url.range) ? url.range : DEFAULT_RANGE;
  const preset = presetFor(range);
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading } = useAdminQuery<AnalyticsResponse>(`/stats/analytics?${query}`);

  return (
    <div className="flex flex-col gap-6">
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

      <FormError message={error} />

      {!data ? (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading analytics">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[380px] rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StaggerItem>
              <KpiCard icon={DollarSign} label="Revenue" value={data.summary.revenue.value} format={formatPrice} kpi={data.summary.revenue} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard icon={Receipt} label="Orders" value={data.summary.orders.value} format={formatNumber} kpi={data.summary.orders} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard
                icon={ShoppingBag}
                label="Average order"
                value={data.summary.averageOrderValue.value}
                format={formatPrice}
                kpi={data.summary.averageOrderValue}
              />
            </StaggerItem>
            <StaggerItem>
              <KpiCard icon={Package} label="Units sold" value={data.summary.unitsSold.value} format={formatNumber} kpi={data.summary.unitsSold} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard
                icon={UserPlus}
                label="New customers"
                value={data.summary.newCustomers.value}
                format={formatNumber}
                kpi={data.summary.newCustomers}
              />
            </StaggerItem>
          </Stagger>

          <motion.div className="min-w-0" {...reveal(0.1)}>
            <ChartCard
              title="Revenue"
              description={`Paid orders, ${preset.long.toLowerCase()}`}
              loading={loading}
              legend={<RevenueLegend hasPrevious={data.range.previous !== null} />}
              chart={<RevenueChart series={data.series} unit={data.range.unit} height={320} />}
              table={
                <SeriesTable
                  series={data.series}
                  unit={data.range.unit}
                  columns={[
                    { label: 'Revenue', value: (p) => formatPrice(p.revenue) },
                    ...(data.range.previous
                      ? [{ label: 'Previous period', value: (p: SeriesPoint) => (p.previousRevenue === null ? '—' : formatPrice(p.previousRevenue)) }]
                      : []),
                  ]}
                />
              }
            />
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div className="min-w-0" {...reveal(0.18)}>
              <ChartCard
                title="Orders"
                description="Paid orders per period"
                loading={loading}
                chart={<OrdersBarChart series={data.series} unit={data.range.unit} />}
                table={
                  <SeriesTable
                    series={data.series}
                    unit={data.range.unit}
                    columns={[{ label: 'Orders', value: (p) => formatNumber(p.orders) }]}
                  />
                }
              />
            </motion.div>
            <motion.div className="min-w-0" {...reveal(0.24)}>
              <ChartCard
                title="Average order value"
                description="Revenue ÷ orders, per period"
                loading={loading}
                chart={<AovLineChart series={data.series} unit={data.range.unit} />}
                table={
                  <SeriesTable
                    series={data.series}
                    unit={data.range.unit}
                    columns={[
                      { label: 'Average order', value: (p) => (p.orders ? formatPrice(Math.round(p.revenue / p.orders)) : '—') },
                    ]}
                  />
                }
              />
            </motion.div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div className="min-w-0" {...reveal(0.3)}>
              <ChartCard
                title="Revenue by category"
                description="Where the money comes from"
                loading={loading}
                chart={
                  data.byCategory.length === 0 ? (
                    <EmptyState icon={Package} title="No sales in this period" />
                  ) : (
                    <div className="pb-4">
                      <HorizontalBars
                        data={data.byCategory.map((c) => ({
                          label: c.category,
                          value: c.revenue,
                          details: [{ label: 'units', value: formatNumber(c.units) }],
                        }))}
                        format={formatPrice}
                      />
                    </div>
                  )
                }
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byCategory.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell className="capitalize">{c.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(c.units)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPrice(c.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              />
            </motion.div>
            <motion.div className="min-w-0" {...reveal(0.36)}>
              <StatusBreakdown data={data} loading={loading} />
            </motion.div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <motion.div className="min-w-0 xl:col-span-2" {...reveal(0.42)}>
              <TopProducts data={data} loading={loading} />
            </motion.div>
            <motion.div className="min-w-0" {...reveal(0.48)}>
              <TopCustomers data={data} loading={loading} />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

/** Orders created in the range, by status. Counts with a neutral bar; the badge carries the status. */
function StatusBreakdown({ data, loading }: { data: AnalyticsResponse; loading: boolean }) {
  const counts = new Map(data.byStatus.map((s) => [s.status, s.count]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return (
    <Card className={cn('h-full gap-4 transition-opacity', loading && 'opacity-50')}>
      <CardHeader>
        <CardTitle>Orders by status</CardTitle>
        <CardDescription>{formatNumber(total)} orders created in this period</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {STATUS_ORDER.map((status, i) => {
          const count = counts.get(status) ?? 0;
          const pct = total ? (count / total) * 100 : 0;
          return (
            <div key={status} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <OrderStatusBadge status={status} />
                  <span className="text-muted-foreground">{STATUS_HELP[status]}</span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatNumber(count)} <span className="text-muted-foreground">({Math.round(pct)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-(--series-1)"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.7, ease: EASE_OUT }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopProducts({ data, loading }: { data: AnalyticsResponse; loading: boolean }) {
  const totalRevenue = data.summary.revenue.value;
  return (
    <Card className={cn('h-full gap-0 py-0 transition-opacity', loading && 'opacity-50')}>
      <CardHeader className="border-b py-4">
        <CardTitle>Top products</CardTitle>
        <CardDescription>By units sold</CardDescription>
      </CardHeader>
      {data.topProducts.length === 0 ? (
        <EmptyState icon={Package} title="No sales in this period" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-6">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="w-40 pr-6">Share of revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topProducts.map((p, i) => {
                const share = totalRevenue ? (p.revenue / totalRevenue) * 100 : 0;
                return (
                  <TableRow key={p.productId}>
                    <TableCell className="pl-6 text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/admin/products/${p.productId}`} className="flex items-center gap-3 hover:underline">
                        <Thumb src={p.image} alt={p.name} className="size-9" />
                        <span className="max-w-56 truncate font-medium">{p.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.units)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(p.revenue)}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-(--series-1)"
                            initial={{ width: 0 }}
                            animate={{ width: `${share}%` }}
                            transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: EASE_OUT }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round(share)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function TopCustomers({ data, loading }: { data: AnalyticsResponse; loading: boolean }) {
  return (
    <Card className={cn('h-full gap-3 transition-opacity', loading && 'opacity-50')}>
      <CardHeader>
        <CardTitle>Top customers</CardTitle>
        <CardDescription>By amount spent in this period</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {data.topCustomers.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>}
        {data.topCustomers.map((c) => (
          <Link
            key={c.customerId}
            href={`/admin/customers/${c.customerId}`}
            className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
          >
            <Avatar name={c.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block text-xs text-muted-foreground">
                {c.orders} {c.orders === 1 ? 'order' : 'orders'}
              </span>
            </span>
            <span className="text-sm font-medium tabular-nums">{formatPrice(c.spent)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

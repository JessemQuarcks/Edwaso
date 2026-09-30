'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, ChevronDown, CircleAlert, Download, Landmark, Percent, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useAdminQuery } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { DEFAULT_RANGE, isRangeId, presetFor, RANGE_PRESETS, rangeQuery, type RangeId } from '@/lib/admin-range';
import { bucketLabel, bucketTick, formatCompactPrice, formatDate, formatDateTime, formatPrice, orderNumber } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { ChartCard, LegendKey } from '@/components/admin/charts';
import { CountTabs, EmptyState, KpiCard, Pagination, Segmented } from '@/components/admin/kit';
import { EASE_OUT, rowMotion, Stagger, StaggerItem } from '@/components/admin/motion';
import type { FinancePoint, FinanceSummary, LedgerResponse, Payout, PayoutDetail, RangeUnit } from '@/types/admin';

export default function FinancePage() {
  return (
    <Suspense>
      <Finance />
    </Suspense>
  );
}

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

function Finance() {
  const admin = useAdmin();
  const [url, setUrl] = useUrlState({ range: DEFAULT_RANGE as string, type: 'all', page: '1' });
  const range: RangeId = isRangeId(url.range) ? url.range : DEFAULT_RANGE;
  const preset = presetFor(range);
  const query = useMemo(() => rangeQuery(range), [range]);
  const { data, error, loading } = useAdminQuery<FinanceSummary>(admin.role === 'staff' ? null : `/finance/summary?${query}`);

  if (admin.role === 'staff') {
    return (
      <Card>
        <EmptyState icon={Landmark} title="Finance is for owners and admins" />
      </Card>
    );
  }

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
          {preset.previous && <> · compared with the {preset.previous}</>} · from the Stripe ledger
        </span>
      </div>

      <FormError message={error} />

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <KpiCard icon={Banknote} label="Gross payments" value={data.kpis.gross.value} format={formatPrice} kpi={data.kpis.gross} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard icon={Receipt} label="Stripe fees" value={data.kpis.fees.value} format={formatPrice} kpi={data.kpis.fees} goodWhenUp={false} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard icon={RotateCcw} label="Refunds" value={data.kpis.refunds.value} format={formatPrice} kpi={data.kpis.refunds} goodWhenUp={false} />
            </StaggerItem>
            <StaggerItem>
              <KpiCard icon={Wallet} label="Net revenue" value={data.kpis.net.value} format={formatPrice} kpi={data.kpis.net} />
            </StaggerItem>
          </Stagger>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45, ease: EASE_OUT }}>
            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              <ChartCard
                className="min-w-0"
                title="Gross vs net"
                description="What customers paid, and what you kept after fees and refunds"
                loading={loading}
                legend={
                  <>
                    <LegendKey color="var(--series-1)" label="Gross" shape="square" />
                    <LegendKey color="var(--series-2)" label="Net" />
                  </>
                }
                chart={<GrossNetChart series={data.series} unit={data.range.unit} />}
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                        <TableHead className="text-right">Refunds</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.series].reverse().map((p) => (
                        <TableRow key={p.key}>
                          <TableCell className="whitespace-nowrap">{bucketLabel(p.start, data.range.unit)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPrice(p.gross)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPrice(p.fees)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPrice(p.refunds)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPrice(p.net)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              />
              <Card className={cn('gap-4 transition-opacity', loading && 'opacity-50')}>
                <CardHeader>
                  <CardTitle>Health</CardTitle>
                  <CardDescription>{preset.long}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Ratio icon={Percent} label="Gross margin" value={pct(data.margin.marginPercent)} detail={data.margin.marginPercent !== null ? `${formatPrice(data.margin.grossProfit)} profit on items with a cost price` : 'Add cost prices to products to see margin'} />
                  {data.margin.coveragePercent !== null && data.margin.coveragePercent < 99.5 && (
                    <p className="-mt-2 text-xs text-muted-foreground">Covers {pct(data.margin.coveragePercent)} of item revenue.</p>
                  )}
                  <Ratio icon={RotateCcw} label="Refund rate" value={pct(data.refundRate)} detail="Refunds as a share of gross payments" />
                  <Ratio icon={Receipt} label="Effective fee rate" value={pct(data.feeRate)} detail="Stripe fees as a share of gross payments" />
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </>
      )}

      <Ledger type={url.type} page={Number(url.page) || 1} onType={(t) => setUrl({ type: t, page: '1' })} onPage={(p) => setUrl({ page: String(p) })} />
      <Payouts />
    </div>
  );
}

function Ratio({ icon: Icon, label, value, detail }: { icon: typeof Percent; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

const AXIS = { fontSize: 12, fill: 'var(--chart-axis)' };

function GrossNetChart({ series, unit }: { series: FinancePoint[]; unit: RangeUnit }) {
  const years = series.length > 1 && new Date(series[0]!.start).getFullYear() !== new Date(series.at(-1)!.start).getFullYear();
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gross-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="start" tickFormatter={(v: string) => bucketTick(v, unit, years)} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} minTickGap={24} tickMargin={8} />
        <YAxis tickFormatter={formatCompactPrice} tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
          content={(props) => {
            const p = props as TooltipContentProps<number, string>;
            const d = p.active ? (p.payload?.[0]?.payload as FinancePoint | undefined) : undefined;
            if (!d) return null;
            return (
              <div className="min-w-44 rounded-lg bg-(--chart-tooltip) px-3 py-2 text-xs text-(--chart-tooltip-foreground) shadow-lg">
                <p className="mb-1.5 font-medium opacity-80">{bucketLabel(d.start, unit)}</p>
                {[
                  ['var(--series-1)', formatPrice(d.gross), 'gross'],
                  ['transparent', `− ${formatPrice(d.fees)}`, 'fees'],
                  ['transparent', `− ${formatPrice(d.refunds)}`, 'refunds'],
                  ['var(--series-2)', formatPrice(d.net), 'net'],
                ].map(([color, value, label]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
                    <span className="font-semibold tabular-nums">{value}</span>
                    <span className="opacity-70">{label}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="gross" stroke="var(--series-1)" strokeWidth={2} fill="url(#gross-wash)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} animationDuration={900} />
        <Line type="monotone" dataKey="net" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} animationDuration={900} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const LEDGER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'payment', label: 'Payments' },
  { id: 'refund', label: 'Refunds' },
] as const;
const LIMIT = 15;

function Ledger({ type, page, onType, onPage }: { type: string; page: number; onType: (t: string) => void; onPage: (p: number) => void }) {
  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (type !== 'all') params.set('type', type);
  const { data, error, loading } = useAdminQuery<LedgerResponse>(`/finance/transactions?${params}`);
  const exportParams = type !== 'all' ? `?type=${type}` : '';

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b py-4">
        <div>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Every payment and refund that went through Stripe</CardDescription>
        </div>
        <a href={`/api/admin/finance/transactions/export${exportParams}`} className={buttonVariants({ variant: 'outline', size: 'sm' })} download>
          <Download /> Export CSV
        </a>
      </CardHeader>
      <div className="px-4 pt-3">
        <CountTabs label="Transaction type" options={LEDGER_TABS} value={(LEDGER_TABS.some((t) => t.id === type) ? type : 'all') as (typeof LEDGER_TABS)[number]['id']} onChange={onType} />
      </div>
      <FormError message={error} />
      {!data ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : data.transactions.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions yet" description="Payments appear here as Stripe confirms them." />
      ) : (
        <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-50')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="pr-6 text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody key={params.toString()}>
              {data.transactions.map((t, i) => (
                <motion.tr key={t._id} {...rowMotion(i)} className="border-b">
                  <TableCell className="pl-6 whitespace-nowrap text-muted-foreground">{formatDateTime(t.occurredAt)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {t.type === 'payment' ? <ArrowDownRight className="size-4 text-delta-good" /> : <ArrowUpRight className="size-4 text-delta-bad" />}
                      {t.type === 'payment' ? 'Payment' : 'Refund'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {t.order ? (
                      <Link href={`/admin/orders/${t.order._id}`} className="hover:underline">
                        {orderNumber(t.order._id)}
                        <span className="ml-1.5 text-muted-foreground">{t.order.user?.name}</span>
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(t.amount, t.currency)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{t.fee ? `− ${formatPrice(t.fee, t.currency)}` : '—'}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{formatPrice(t.net, t.currency)}</TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} limit={LIMIT} noun="transactions" onPage={onPage} />}
    </Card>
  );
}

function Payouts() {
  const { data, error } = useAdminQuery<{ payouts: Payout[] }>('/finance/payouts');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Payouts</CardTitle>
        <CardDescription>Transfers from Stripe to your bank, checked against the ledger</CardDescription>
      </CardHeader>
      {error ? (
        <EmptyState icon={Landmark} title="Payouts aren’t available" description={error} />
      ) : !data ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : data.payouts.length === 0 ? (
        <EmptyState icon={Landmark} title="No payouts yet" description="Stripe pays out your balance on its schedule." />
      ) : (
        <ul className="divide-y">
          {data.payouts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(open === p.id ? null : p.id)}
                aria-expanded={open === p.id}
                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-3">
                  <Landmark className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{formatPrice(p.amount, p.currency)}</span>
                    <span className="block text-xs text-muted-foreground">Arrives {formatDate(p.arrivalDate)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant={p.status === 'paid' ? 'secondary' : 'outline'} className="capitalize">
                    {p.status.replace('_', ' ')}
                  </Badge>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open === p.id && 'rotate-180')} />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === p.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
                    <PayoutReconciliation id={p.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PayoutReconciliation({ id }: { id: string }) {
  const { data, error } = useAdminQuery<PayoutDetail>(`/finance/payouts/${id}`);
  if (error) return <p className="px-6 pb-4 text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="mx-6 mb-4 h-20 rounded-lg" />;
  return (
    <div className="flex flex-col gap-3 px-6 pb-4">
      <p className="flex items-center gap-2 text-sm">
        {data.unmatched === 0 ? <CheckCircle2 className="size-4 text-delta-good" /> : <CircleAlert className="size-4 text-status-warning" />}
        {data.matched} of {data.matched + data.unmatched} transactions match the ledger
        {data.unmatched > 0 && ' — the rest are Stripe adjustments or activity recorded outside this store'}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Ledger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="capitalize">{t.type.replace('_', ' ')}</TableCell>
                <TableCell>{t.orderId ? <Link href={`/admin/orders/${t.orderId}`} className="hover:underline">{orderNumber(t.orderId)}</Link> : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(t.net, data.payout.currency)}</TableCell>
                <TableCell>{t.matched ? <Badge variant="secondary">Matched</Badge> : <Badge variant="outline">Not in ledger</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

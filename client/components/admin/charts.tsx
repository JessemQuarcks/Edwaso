'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { ChartLine, Table2 } from 'lucide-react';
import { bucketLabel, bucketTick, formatCompactPrice, formatNumber, formatPrice } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RangeUnit, SeriesPoint } from '@/types/admin';

// Chart conventions (see the dataviz guidance this follows):
// - one y-axis per chart; revenue and order counts are never mixed on one plot
// - series colours are the validated categorical slots --series-1 / --series-2
// - 2px lines, 10% area wash, bars <= 24px with 4px rounded data ends
// - hairline solid grid, muted axis text, a crosshair tooltip, and a table view for every chart

const AXIS = { fontSize: 12, fill: 'var(--chart-axis)' };
const GRID = { stroke: 'var(--chart-grid)', strokeDasharray: undefined, vertical: false } as const;

/** Card with a title, an optional legend, and a chart/table toggle. */
export function ChartCard({
  title,
  description,
  legend,
  chart,
  table,
  loading = false,
  className,
  headerExtra,
}: {
  title: string;
  description?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  /** Dims the previous render while new data loads, instead of flashing a skeleton. */
  loading?: boolean;
  className?: string;
  headerExtra?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            aria-label={view === 'chart' ? `Show ${title} as a table` : `Show ${title} as a chart`}
            title={view === 'chart' ? 'Table view' : 'Chart view'}
          >
            {view === 'chart' ? <Table2 /> : <ChartLine />}
          </Button>
        </div>
      </CardHeader>
      <div className={cn('px-4 transition-opacity duration-300 sm:px-6', loading && 'opacity-50')}>
        {legend && view === 'chart' && <div className="mb-3 flex flex-wrap gap-4 text-sm">{legend}</div>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'chart' ? chart : <div className="max-h-80 overflow-auto">{table}</div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}

/** Legend entry: a short line key (for lines) or a square (for bars/areas), with text in ink colours. */
export function LegendKey({ color, label, shape = 'line' }: { color: string; label: string; shape?: 'line' | 'square' }) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span
        aria-hidden
        className={shape === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm'}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

/** Dark tooltip card: values lead, series names follow, keyed with a short line. */
function TooltipCard({ title, rows }: { title: string; rows: { color: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg bg-(--chart-tooltip) px-3 py-2 text-xs text-(--chart-tooltip-foreground) shadow-lg">
      <p className="mb-1.5 font-medium opacity-80">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
            <span className="font-semibold tabular-nums">{r.value}</span>
            <span className="opacity-70">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Datum = SeriesPoint & { aov?: number | null };
const datumOf = (props: TooltipContentProps<number, string>): Datum | undefined =>
  props.active ? (props.payload?.[0]?.payload as Datum | undefined) : undefined;

const spansYears = (series: SeriesPoint[]) =>
  series.length > 1 && new Date(series[0]!.start).getFullYear() !== new Date(series.at(-1)!.start).getFullYear();

function xAxisProps(series: SeriesPoint[], unit: RangeUnit) {
  const years = spansYears(series);
  return {
    dataKey: 'start',
    tickFormatter: (v: string) => bucketTick(v, unit, years),
    tick: AXIS,
    tickLine: false,
    axisLine: { stroke: 'var(--chart-grid)' },
    minTickGap: 24,
    tickMargin: 8,
  } as const;
}

// ---- Revenue: this period vs previous ----

export function RevenueChart({
  series,
  unit,
  height = 280,
}: {
  series: SeriesPoint[];
  unit: RangeUnit;
  height?: number;
}) {
  const hasPrevious = series.some((p) => p.previousRevenue !== null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revenue-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis {...xAxisProps(series, unit)} />
        <YAxis
          tickFormatter={formatCompactPrice}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
          content={(props) => {
            const d = datumOf(props as TooltipContentProps<number, string>);
            if (!d) return null;
            const rows = [{ color: 'var(--series-1)', label: 'This period', value: formatPrice(d.revenue) }];
            if (d.previousRevenue !== null) {
              rows.push({ color: 'var(--series-2)', label: 'Previous period', value: formatPrice(d.previousRevenue) });
            }
            rows.push({ color: 'transparent', label: d.orders === 1 ? 'order' : 'orders', value: formatNumber(d.orders) });
            return <TooltipCard title={bucketLabel(d.start, unit)} rows={rows} />;
          }}
        />
        {hasPrevious && (
          <Line
            type="monotone"
            dataKey="previousRevenue"
            name="Previous period"
            stroke="var(--series-2)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
            animationDuration={900}
          />
        )}
        <Area
          type="monotone"
          dataKey="revenue"
          name="This period"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="url(#revenue-wash)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueLegend({ hasPrevious }: { hasPrevious: boolean }) {
  return (
    <>
      <LegendKey color="var(--series-1)" label="This period" />
      {hasPrevious && <LegendKey color="var(--series-2)" label="Previous period" />}
    </>
  );
}

export function SeriesTable({
  series,
  unit,
  columns,
}: {
  series: SeriesPoint[];
  unit: RangeUnit;
  columns: { label: string; value: (p: SeriesPoint) => string }[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          {columns.map((c) => (
            <TableHead key={c.label} className="text-right">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...series].reverse().map((p) => (
          <TableRow key={p.key}>
            <TableCell className="whitespace-nowrap">{bucketLabel(p.start, unit)}</TableCell>
            {columns.map((c) => (
              <TableCell key={c.label} className="text-right tabular-nums">
                {c.value(p)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---- Orders per bucket (single series) ----

export function OrdersBarChart({ series, unit, height = 240 }: { series: SeriesPoint[]; unit: RangeUnit; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid {...GRID} />
        <XAxis {...xAxisProps(series, unit)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={(props) => {
            const d = datumOf(props as TooltipContentProps<number, string>);
            if (!d) return null;
            return (
              <TooltipCard
                title={bucketLabel(d.start, unit)}
                rows={[{ color: 'var(--series-1)', label: d.orders === 1 ? 'order' : 'orders', value: formatNumber(d.orders) }]}
              />
            );
          }}
        />
        <Bar dataKey="orders" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} animationDuration={800} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Average order value (single series) ----

export function AovLineChart({ series, unit, height = 240 }: { series: SeriesPoint[]; unit: RangeUnit; height?: number }) {
  // Buckets without orders have no average; leave a gap rather than plotting a false zero.
  const data = series.map((p) => ({ ...p, aov: p.orders ? Math.round(p.revenue / p.orders) : null }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis {...xAxisProps(series, unit)} />
        <YAxis tickFormatter={formatCompactPrice} tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
          content={(props) => {
            const d = datumOf(props as TooltipContentProps<number, string>);
            if (!d) return null;
            return (
              <TooltipCard
                title={bucketLabel(d.start, unit)}
                rows={[
                  {
                    color: 'var(--series-1)',
                    label: 'average order',
                    value: d.aov === null || d.aov === undefined ? '—' : formatPrice(d.aov),
                  },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="aov"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinecap="round"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          connectNulls={false}
          animationDuration={900}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Horizontal bars with the value at the tip (one colour: categories are nominal) ----

export interface BarDatum {
  label: string;
  value: number;
  /** Extra tooltip lines, e.g. units sold alongside revenue. */
  details?: { label: string; value: string }[];
}

export function HorizontalBars({ data, format }: { data: BarDatum[]; format: (value: number) => string }) {
  const height = Math.max(data.length * 40, 80);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ ...AXIS, fill: 'var(--foreground)' }}
          tickLine={false}
          axisLine={false}
          width={110}
          tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v.charAt(0).toUpperCase() + v.slice(1))}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={(props) => {
            const p = props as TooltipContentProps<number, string>;
            const d = p.active ? (p.payload?.[0]?.payload as BarDatum | undefined) : undefined;
            if (!d) return null;
            const rows = [{ label: '', value: format(d.value) }, ...(d.details ?? [])];
            return <TooltipCard title={d.label} rows={rows.map((r) => ({ ...r, color: 'var(--series-1)' }))} />;
          }}
        />
        <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={24} animationDuration={800}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => format(Number(v))}
            style={{ fontSize: 12, fill: 'var(--foreground)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

'use client';

import { useId, type ComponentType, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, Search } from 'lucide-react';
import { formatChange, initials } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CountUp } from './motion';
import type { Kpi } from '@/types/admin';

// Small building blocks shared by the console pages.

/** Native <select>, styled like the shadcn inputs. Native so filters work with a keyboard and on mobile. */
export const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/**
 * Signed change vs the previous period. Colour carries direction × whether that direction is
 * good; the arrow and sign carry it too, so it never relies on colour alone.
 */
export function DeltaPill({ change, goodWhenUp = true }: { change: number | null; goodWhenUp?: boolean }) {
  if (change === null) {
    return <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">No prior data</span>;
  }
  const flat = Math.abs(change) < 0.05;
  const good = flat ? null : change > 0 === goodWhenUp;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
        good === null && 'bg-muted text-muted-foreground',
        good === true && 'bg-delta-good/10 text-delta-good',
        good === false && 'bg-delta-bad/10 text-delta-bad'
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatChange(change)}
    </span>
  );
}

/** Stat tile: icon, label, animated value and change vs the previous period. */
export function KpiCard({
  icon: Icon,
  label,
  value,
  format,
  kpi,
  goodWhenUp,
  caption,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  format: (n: number) => string;
  kpi?: Kpi;
  goodWhenUp?: boolean;
  /** Replaces the delta pill, e.g. "+3 new". */
  caption?: ReactNode;
}) {
  return (
    <Card className="group h-full flex-row items-center gap-4 p-4 transition-shadow hover:shadow-md">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted transition-transform duration-300 group-hover:scale-105">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <CountUp value={value} format={format} className="text-2xl font-semibold tracking-tight" />
          {caption ?? (kpi && <DeltaPill change={kpi.change} goodWhenUp={goodWhenUp} />)}
        </div>
      </div>
    </Card>
  );
}

/** Segmented control with a sliding selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selected ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-primary shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Underlined tabs with counts, e.g. order statuses. */
export function CountTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 pt-1 pb-2.5 text-sm transition-colors outline-none focus-visible:text-foreground',
              selected ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {o.count}
              </span>
            )}
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-8"
      />
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  limit,
  onPage,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  if (total === 0) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {first}–{last} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
          Previous
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2 px-4 py-16 text-center"
    >
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground',
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Product image with a neutral fallback. */
export function Thumb({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted', className)}>
      {src ? (
        // Remote catalog images of unknown hosts; next/image would need each host allow-listed.
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="text-xs text-muted-foreground" aria-hidden>
          {alt.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** Stock level as a short meter plus a label, so the state never depends on colour. */
export function StockMeter({ stock, threshold }: { stock: number; threshold: number }) {
  const state = stock === 0 ? 'out' : stock <= threshold ? 'low' : 'ok';
  const pct = Math.min(stock / (threshold * 4), 1) * 100;
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm tabular-nums">
        {stock}
        <span className="text-muted-foreground">
          {state === 'out' ? ' · Out of stock' : state === 'low' ? ' · Low' : ''}
        </span>
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.span
          className={cn(
            'block h-full rounded-full',
            state === 'out' ? 'bg-delta-bad' : state === 'low' ? 'bg-status-warning' : 'bg-foreground/70'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, state === 'out' ? 0 : 4)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </span>
    </div>
  );
}

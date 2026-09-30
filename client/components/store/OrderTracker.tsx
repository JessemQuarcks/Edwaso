'use client';

import { motion } from 'motion/react';
import { Check, CircleDollarSign, PackageCheck, PackageOpen, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reachedAt } from '@/lib/customer-orders';
import { EASE_OUT } from './motion';
import type { Order, OrderStatus } from '@/types';

const STEPS: { status: OrderStatus; label: string; icon: typeof Truck }[] = [
  { status: 'paid', label: 'Confirmed', icon: CircleDollarSign },
  { status: 'processing', label: 'Preparing', icon: PackageOpen },
  { status: 'shipped', label: 'Shipped', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: PackageCheck },
];

/** Index of the furthest step the order has reached (-1 before payment). */
export function progressIndex(o: Order): number {
  return STEPS.reduce((acc, s, i) => (reachedAt(o, s.status) || o.status === s.status ? i : acc), -1);
}

const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/**
 * Confirmed → Preparing → Shipped → Delivered. `compact` is the slim version for order cards:
 * small dots on a line, labels underneath, no dates.
 */
export default function OrderTracker({ order, compact = false }: { order: Order; compact?: boolean }) {
  const current = progressIndex(order);
  const size = compact ? 'size-6' : 'size-10';
  const top = compact ? 'top-3' : 'top-5';

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={`Order progress: ${STEPS[current]?.label ?? 'not started'}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        const Icon = step.icon;
        return (
          <li key={step.status} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={i === current ? 'step' : undefined}>
            {i > 0 && (
              <span aria-hidden className={cn('absolute right-1/2 left-[-50%] h-0.5 bg-muted', top)}>
                <motion.span
                  className="block h-full origin-left bg-foreground"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.2, ease: EASE_OUT }}
                />
              </span>
            )}
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.2, type: 'spring', stiffness: 400, damping: 22 }}
              className={cn(
                'relative z-10 flex items-center justify-center rounded-full border-2 transition-colors',
                size,
                done ? 'border-foreground bg-foreground text-background' : 'border-muted bg-background text-muted-foreground'
              )}
            >
              {done && i < current ? <Check className={compact ? 'size-3' : 'size-4'} /> : <Icon className={compact ? 'size-3' : 'size-4'} />}
              {i === current && order.status !== 'delivered' && (
                <span className="absolute inset-0 animate-ping rounded-full bg-foreground/20 motion-reduce:hidden" aria-hidden />
              )}
            </motion.span>
            <span className={cn(compact ? 'text-[11px]' : 'text-xs font-medium sm:text-sm', !done && 'text-muted-foreground', i === current && 'font-semibold text-foreground')}>
              {step.label}
            </span>
            {!compact && <span className="hidden text-xs text-muted-foreground sm:block">{dateTime(reachedAt(order, step.status))}</span>}
          </li>
        );
      })}
    </ol>
  );
}

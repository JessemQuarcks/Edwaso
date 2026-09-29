'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, PartyPopper, Trophy } from 'lucide-react';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from './kit';
import { EASE_OUT } from './motion';
import type { ProductSales } from '@/types/admin';

const AUTO_ADVANCE_MS = 5000;

/** "Congratulations!" card: the period's best sellers in a small cover-flow carousel. */
export default function BestSellers({ products, periodLabel }: { products: ProductSales[]; periodLabel: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = products.length;

  // Back to the top seller whenever the list changes (e.g. a new range).
  const ids = products.map((p) => p.productId).join();
  useEffect(() => setIndex(0), [ids]);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);
  const current = products[index];

  return (
    <Card
      className="relative gap-0 overflow-hidden bg-gradient-to-b from-muted/80 to-card p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Congratulations!
            <motion.span
              aria-hidden
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: [0, -12, 10, 0], scale: 1 }}
              transition={{ duration: 0.9, ease: EASE_OUT }}
            >
              <PartyPopper className="size-5 text-status-warning" />
            </motion.span>
          </p>
          <p className="text-sm text-muted-foreground">Your best sellers, {periodLabel.toLowerCase()}.</p>
        </div>
      </div>

      {count === 0 ? (
        <EmptyState icon={Trophy} title="No sales yet" description="Best sellers will appear here once orders come in." />
      ) : (
        <>
          <div className="relative mt-5 flex h-48 items-center justify-center" aria-roledescription="carousel" aria-label="Best sellers">
            {products.map((p, i) => {
              // Position relative to the current slide, wrapped so neighbours sit either side.
              let offset = i - index;
              if (offset > count / 2) offset -= count;
              if (offset < -count / 2) offset += count;
              const visible = Math.abs(offset) <= 1;
              return (
                <motion.div
                  key={p.productId}
                  className="absolute"
                  initial={false}
                  animate={{
                    x: offset * 96,
                    scale: offset === 0 ? 1 : 0.78,
                    opacity: visible ? (offset === 0 ? 1 : 0.55) : 0,
                    zIndex: offset === 0 ? 2 : 1,
                  }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                  aria-hidden={offset !== 0}
                >
                  <div className="flex size-36 items-center justify-center sm:size-40 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-foreground/5">
                    {p.image ? (
                      <img src={p.image} alt={offset === 0 ? p.name : ''} className="size-full object-cover" />
                    ) : (
                      <Trophy className="size-10 text-muted-foreground" />
                    )}
                  </div>
                </motion.div>
              );
            })}
            {count > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="absolute left-0 z-10 rounded-full bg-card shadow-sm"
                  onClick={() => go(-1)}
                  aria-label="Previous best seller"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="absolute right-0 z-10 rounded-full bg-card shadow-sm"
                  onClick={() => go(1)}
                  aria-label="Next best seller"
                >
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>

          {current && (
            <motion.div
              key={current.productId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 text-center"
              aria-live="polite"
            >
              <Link href={`/admin/products/${current.productId}`} className="font-semibold hover:underline">
                <span className="mr-1.5 text-muted-foreground">#{index + 1}</span>
                {current.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {formatNumber(current.units)} sold · {formatPrice(current.revenue)}
              </p>
            </motion.div>
          )}

          {count > 1 && (
            <div className="mt-3 flex justify-center gap-1.5">
              {products.map((p, i) => (
                <button
                  key={p.productId}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show best seller ${i + 1}`}
                  aria-current={i === index}
                  className="h-1.5 rounded-full bg-foreground/20 transition-all aria-[current=true]:w-4 aria-[current=true]:bg-foreground w-1.5"
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

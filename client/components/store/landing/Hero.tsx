'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform, type Variants } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { formatPrice } from '@/lib/api';
import { buttonVariants } from '@/components/ui/button';
import ProductImage from '../ProductImage';
import { EASE_OUT } from '../motion';
import type { Product } from '@/types';

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const rise: Variants = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_OUT } } };

export default function Hero({
  eyebrow,
  title,
  subtitle,
  products,
  trustLine,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Up to three products for the collage (featured first). */
  products: Product[];
  trustLine: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  // Layers drift at different speeds as the hero scrolls away.
  const back = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 60]);
  const front = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 40]);

  const [main, second, third] = products;

  return (
    <section ref={ref} className="relative mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand-soft px-6 py-14 sm:px-12 sm:py-20 lg:py-24">
        {/* Soft drifting colour behind everything. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="animate-drift absolute -top-24 -left-24 size-[28rem] rounded-full bg-brand/25 blur-3xl" />
          <div className="animate-drift absolute -right-32 -bottom-32 size-[32rem] rounded-full bg-sky-400/20 blur-3xl [animation-delay:-6s]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--foreground)_8%,transparent)_1px,transparent_0)] [background-size:22px_22px] opacity-40" />
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <motion.div variants={container} initial="hidden" animate="show" style={{ y: textY }} className="flex flex-col items-start gap-6">
            {eyebrow && (
              <motion.span variants={rise} className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-background/70 px-3 py-1 text-xs font-medium backdrop-blur">
                <Sparkles className="size-3.5 text-brand" />
                {eyebrow}
              </motion.span>
            )}
            <motion.h1 variants={rise} className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {title}
            </motion.h1>
            {subtitle && (
              <motion.p variants={rise} className="max-w-xl text-lg text-pretty text-muted-foreground">
                {subtitle}
              </motion.p>
            )}
            <motion.div variants={rise} className="flex flex-wrap gap-3">
              <Link href="/shop" className={buttonVariants({ size: 'lg', className: 'group h-12 rounded-full px-6 text-base' })}>
                Shop now
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="#categories" className={buttonVariants({ size: 'lg', variant: 'outline', className: 'h-12 rounded-full bg-background/60 px-6 text-base backdrop-blur' })}>
                Browse categories
              </Link>
            </motion.div>
            {trustLine && (
              <motion.p variants={rise} className="text-sm text-muted-foreground">
                {trustLine}
              </motion.p>
            )}
          </motion.div>

          {main && (
            <div className="relative mx-auto aspect-square w-full max-w-lg lg:max-w-none">
              <motion.div
                style={{ y: back }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
                className="absolute inset-[6%_14%_10%_10%] overflow-hidden rounded-[2rem] shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5"
              >
                <Link href={`/products/${main._id}`} aria-label={main.name} className="block size-full">
                  <ProductImage src={main.image} alt={main.name} sizes="(min-width: 1024px) 40vw, 90vw" priority className="animate-ken-burns" />
                </Link>
              </motion.div>

              {second && (
                <motion.div
                  style={{ y: front }}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.55 }}
                  className="absolute top-[4%] right-0 w-[34%]"
                >
                  <FloatingCard product={second} delay="0s" />
                </motion.div>
              )}
              {third && (
                <motion.div
                  style={{ y: front }}
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.75 }}
                  className="absolute bottom-0 left-0 w-[38%]"
                >
                  <FloatingCard product={third} delay="-3s" />
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ product, delay }: { product: Product; delay: string }) {
  return (
    <Link
      href={`/products/${product._id}`}
      className="animate-float-slow block overflow-hidden rounded-2xl bg-background p-2 shadow-xl shadow-foreground/10 ring-1 ring-foreground/5 transition-transform hover:scale-[1.03]"
      style={{ animationDelay: delay }}
    >
      <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
        <ProductImage src={product.image} alt={product.name} sizes="200px" priority />
      </span>
      <span className="flex items-center justify-between gap-2 px-1 pt-2 pb-0.5 text-xs">
        <span className="truncate font-medium">{product.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{formatPrice(product.price)}</span>
      </span>
    </Link>
  );
}

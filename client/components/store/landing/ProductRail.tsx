'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductCard from '../../ProductCard';
import { SectionHeader } from './Sections';
import type { Product } from '@/types';

/** Horizontally scrolling row (native scroll-snap, so touch and trackpads just work) with arrow buttons. */
export default function ProductRail({ products, eyebrow, title, href }: { products: Product[]; eyebrow: string; title: string; href: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-roledescription="carousel" aria-label={title}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        action={
          <div className="flex items-center gap-2">
            <Link href={href} className="mr-2 text-sm font-medium underline-offset-4 hover:underline">
              View all
            </Link>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => scrollBy(-1)} disabled={atStart} aria-label="Previous products">
              <ArrowLeft />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => scrollBy(1)} disabled={atEnd} aria-label="Next products">
              <ArrowRight />
            </Button>
          </div>
        }
      />
      <div
        ref={scroller}
        onScroll={update}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p, i) => (
          <div key={p._id} className="w-[70%] shrink-0 snap-start sm:w-[42%] md:w-[31%] lg:w-[23.5%]">
            <ProductCard product={p} priority={i < 2} />
          </div>
        ))}
      </div>
    </section>
  );
}

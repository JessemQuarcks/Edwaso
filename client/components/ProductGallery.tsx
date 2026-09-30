'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import ProductImage from './store/ProductImage';

/** Main image with thumbnails; a single image renders on its own. */
export default function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-muted ring-1 ring-foreground/5">
        <AnimatePresence initial={false}>
          <motion.div
            key={current ?? 'none'}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <ProductImage src={current} alt={name} sizes="(min-width: 1024px) 55vw, 100vw" priority />
          </motion.div>
        </AnimatePresence>
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Product images">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Image ${i + 1} of ${images.length}`}
              onClick={() => setIndex(i)}
              className={cn(
                'relative size-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all',
                i === index ? 'border-foreground' : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              <ProductImage src={src} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

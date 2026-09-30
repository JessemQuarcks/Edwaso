'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import AddToCartButton from '../AddToCartButton';
import { LOW_STOCK } from '../ProductCard';
import { useCart } from '../Providers';
import type { Product } from '@/types';

/** Stock status, quantity stepper and add-to-cart for the product page. */
export default function ProductPurchase({ product }: { product: Product }) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.id === product._id)?.quantity ?? 0;
  const available = Math.max(product.stock - inCart, 0);
  const [qty, setQty] = useState(1);
  const quantity = Math.min(qty, Math.max(available, 1));
  const low = product.stock > 0 && product.stock <= LOW_STOCK;

  return (
    <div className="flex flex-col gap-4">
      <p className={cn('flex items-center gap-2 text-sm font-medium', product.stock > 0 ? (low ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-muted-foreground')}>
        <span className="relative flex size-2.5">
          {product.stock > 0 && <span className={cn('absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping', low ? 'bg-amber-500' : 'bg-emerald-500')} />}
          <span className={cn('relative inline-flex size-2.5 rounded-full', product.stock > 0 ? (low ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-muted-foreground')} />
        </span>
        {product.stock === 0 ? 'Sold out' : low ? `Only ${product.stock} left, order soon` : 'In stock, ready to ship'}
      </p>

      {product.stock > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 items-center rounded-full border">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={quantity <= 1} className="flex size-12 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Decrease quantity">
              <Minus className="size-4" />
            </button>
            <motion.span key={quantity} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-8 text-center font-medium tabular-nums" aria-live="polite" aria-label={`Quantity ${quantity}`}>
              {quantity}
            </motion.span>
            <button type="button" onClick={() => setQty((q) => Math.min(available, q + 1))} disabled={quantity >= available} className="flex size-12 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label="Increase quantity">
              <Plus className="size-4" />
            </button>
          </div>
          {available > 0 ? (
            <AddToCartButton product={product} quantity={quantity} size="lg" openCart className="h-12 flex-1 rounded-full px-8 text-base sm:flex-none" />
          ) : (
            <p className="text-sm text-muted-foreground">You have all remaining stock in your cart.</p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from './Providers';
import type { Product } from '@/types';

interface Props {
  product: Product;
  quantity?: number;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  className?: string;
  /** Icon-only round button (product cards). */
  compact?: boolean;
  /** Open the cart drawer after adding (product page). */
  openCart?: boolean;
}

export default function AddToCartButton({ product, quantity = 1, size = 'default', className, compact = false, openCart = false }: Props) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (product.stock < 1) {
    return compact ? null : (
      <Button variant="secondary" size={size} className={className} disabled>
        Sold out
      </Button>
    );
  }

  function add() {
    cart.add(product, quantity);
    setAdded(true);
    if (openCart) cart.openDrawer();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1400);
  }

  const icon = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={added ? 'added' : 'add'}
        initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        exit={{ scale: 0.4, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className="flex"
      >
        {added ? <Check /> : compact ? <Plus /> : <ShoppingBag />}
      </motion.span>
    </AnimatePresence>
  );

  if (compact) {
    return (
      <Button size="icon" variant={added ? 'default' : 'outline'} className={className} onClick={add} aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`}>
        {icon}
      </Button>
    );
  }

  return (
    <Button size={size === 'icon' ? 'default' : size} className={className} onClick={add}>
      {icon}
      {added ? 'Added to cart' : 'Add to cart'}
    </Button>
  );
}

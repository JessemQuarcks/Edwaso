'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from './Providers';
import type { Product } from '@/types';

interface Props {
  product: Product;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

export default function AddToCartButton({ product, size = 'default', className }: Props) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (product.stock < 1) {
    return (
      <Button variant="secondary" size={size} className={className} disabled>
        Out of stock
      </Button>
    );
  }

  return (
    <Button
      size={size}
      className={className}
      onClick={() => {
        cart.add(product);
        setAdded(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? <Check /> : <Plus />}
      {added ? 'Added' : 'Add to cart'}
    </Button>
  );
}

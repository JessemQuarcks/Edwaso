'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/components/Providers';
import type { Order, Product } from '@/types';

/**
 * Puts a past order's items back in the cart at today's price and stock, then opens the cart.
 * Items that are gone or sold out are skipped and reported.
 */
export function useBuyAgain() {
  const cart = useCart();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ orderId: string; text: string } | null>(null);

  async function buyAgain(order: Order) {
    setBusy(order._id);
    setNotice(null);
    const skipped: string[] = [];
    let added = 0;
    for (const item of order.items) {
      try {
        const { product } = await api<{ product: Product }>(`/products/${item.product}`);
        const quantity = Math.min(item.quantity, product.stock);
        if (quantity < 1) {
          skipped.push(item.name);
          continue;
        }
        cart.add(product, quantity);
        added += 1;
      } catch {
        skipped.push(item.name);
      }
    }
    setBusy(null);
    if (skipped.length) {
      setNotice({
        orderId: order._id,
        text: added ? `Added to your cart. No longer available: ${skipped.join(', ')}.` : 'These items are no longer available.',
      });
    }
    if (added) cart.openDrawer();
  }

  return { buyAgain, busy, notice };
}

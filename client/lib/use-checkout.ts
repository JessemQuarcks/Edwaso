'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from './api';
import { useAuth, useCart } from '@/components/Providers';
import type { CheckoutResponse } from '@/types';

/** Sends the cart to Stripe Checkout, or to the login page first. */
export function useCheckout() {
  const cart = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function checkout() {
    if (!user) {
      cart.closeDrawer();
      router.push('/login?next=/cart');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { url } = await api<CheckoutResponse>('/checkout', {
        method: 'POST',
        auth: true,
        body: { items: cart.items.map((i) => ({ productId: i.id, quantity: i.quantity })) },
      });
      window.location.href = url; // Stripe-hosted Checkout
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return { checkout, loading, error, signedIn: !!user };
}

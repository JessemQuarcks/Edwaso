'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ShoppingCart, Trash2 } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth, useCart } from '@/components/Providers';
import type { CheckoutResponse } from '@/types';

const PLACEHOLDER_THUMB = 'https://picsum.photos/seed/placeholder/120/120';

export default function CartPage() {
  const cart = useCart();
  const { user, ready } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function checkout() {
    if (!user) {
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

  if (cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-20 text-center">
        <ShoppingCart className="size-10 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Your cart is empty</p>
          <p className="text-sm text-muted-foreground">Add a few things and they&apos;ll show up here.</p>
        </div>
        <Link href="/" className={buttonVariants({ size: 'sm' })}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-0 p-0">
            {cart.items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Separator />}
                <div className="flex items-center gap-4 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image || PLACEHOLDER_THUMB}
                    alt=""
                    className="size-16 shrink-0 rounded-md border bg-muted object-cover"
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link href={`/products/${item.id}`} className="truncate font-medium hover:underline">
                      {item.name}
                    </Link>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatPrice(item.price)} each
                    </span>
                  </div>

                  <Input
                    type="number"
                    min={1}
                    max={item.stock}
                    value={item.quantity}
                    onChange={(e) => cart.setQuantity(item.id, parseInt(e.target.value, 10) || 1)}
                    className="h-8 w-16 text-center tabular-nums"
                    aria-label={`Quantity for ${item.name}`}
                  />

                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => cart.remove(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Subtotal ({cart.count} {cart.count === 1 ? 'item' : 'items'})
              </span>
              <span className="tabular-nums">{formatPrice(cart.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(cart.total)}</span>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="mt-2">
            <Button className="w-full" size="lg" onClick={checkout} disabled={loading || !ready}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? 'Redirecting to Stripe' : user ? 'Checkout' : 'Log in to checkout'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

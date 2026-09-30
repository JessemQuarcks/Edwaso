'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ArrowLeft, Loader2, Lock, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { formatPrice } from '@/lib/api';
import { useCheckout } from '@/lib/use-checkout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth, useCart } from '@/components/Providers';
import ProductImage from '@/components/store/ProductImage';
import { EASE_OUT } from '@/components/store/motion';

export default function CartPage() {
  const cart = useCart();
  const { ready } = useAuth();
  const { checkout, loading, error, signedIn } = useCheckout();

  if (cart.items.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 rounded-3xl border border-dashed py-24 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-muted">
          <ShoppingBag className="size-7 text-muted-foreground" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium">Your cart is empty</p>
          <p className="text-sm text-muted-foreground">Add a few things and they’ll show up here.</p>
        </div>
        <Link href="/shop" className={buttonVariants({ className: 'rounded-full' })}>
          Start shopping
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/shop" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Continue shopping
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your cart</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
        <ul className="divide-y rounded-3xl border">
          <AnimatePresence initial={false}>
            {cart.items.map((item) => (
              <motion.li
                key={item.id}
                layout
                exit={{ opacity: 0, x: 40, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="flex items-center gap-4 overflow-hidden p-4 sm:p-5"
              >
                <Link href={`/products/${item.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-24">
                  <ProductImage src={item.image} alt={item.name} sizes="96px" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/products/${item.id}`} className="line-clamp-2 font-medium hover:underline">
                      {item.name}
                    </Link>
                    <p className="text-sm text-muted-foreground tabular-nums">{formatPrice(item.price)} each</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-full border">
                      <button type="button" onClick={() => cart.setQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={`One fewer ${item.name}`}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button type="button" onClick={() => cart.setQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= item.stock} className="flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={`One more ${item.name}`}>
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="w-20 text-right font-semibold tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => cart.remove(item.id)} aria-label={`Remove ${item.name}`}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="flex flex-col gap-4 rounded-3xl border bg-muted/30 p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">Order summary</h2>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Subtotal ({cart.count} {cart.count === 1 ? 'item' : 'items'})
            </span>
            <span className="tabular-nums">{formatPrice(cart.total)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Shipping & taxes</span>
            <span>At checkout</span>
          </div>
          <div className="flex justify-between border-t pt-4 text-lg font-semibold">
            <span>Total</span>
            <motion.span key={cart.total} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="tabular-nums">
              {formatPrice(cart.total)}
            </motion.span>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" className="h-12 w-full rounded-full text-base" onClick={() => void checkout()} disabled={loading || !ready}>
            {loading ? <Loader2 className="animate-spin" /> : <Lock />}
            {loading ? 'Redirecting to Stripe…' : signedIn ? 'Checkout' : 'Log in to checkout'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Payments are processed securely by Stripe.</p>
        </div>
      </div>
    </div>
  );
}

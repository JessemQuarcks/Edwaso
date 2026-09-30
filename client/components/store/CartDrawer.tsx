'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { AlertCircle, Loader2, Lock, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { formatPrice } from '@/lib/api';
import { useCheckout } from '@/lib/use-checkout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCart } from '@/components/Providers';
import ProductImage from './ProductImage';
import { EASE_OUT } from './motion';

/** Slide-over cart, opened from the header or after adding from a product page. */
export default function CartDrawer() {
  const cart = useCart();
  const { checkout, loading, error, signedIn } = useCheckout();

  return (
    <DialogPrimitive.Root open={cart.drawerOpen} onOpenChange={(o) => (o ? cart.openDrawer() : cart.closeDrawer())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-background shadow-2xl outline-none duration-300 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
              <ShoppingBag className="size-5" /> Your cart
              {cart.count > 0 && <span className="text-sm font-normal text-muted-foreground">({cart.count})</span>}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label="Close cart">
              <X />
            </DialogPrimitive.Close>
          </div>

          {cart.items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="size-7 text-muted-foreground" />
              </span>
              <div>
                <p className="font-medium">Your cart is empty</p>
                <p className="text-sm text-muted-foreground">Good things are waiting in the shop.</p>
              </div>
              <DialogPrimitive.Close render={<Link href="/shop" />} nativeButton={false} className={buttonVariants()}>
                Start shopping
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y overflow-y-auto px-5">
                <AnimatePresence initial={false}>
                  {cart.items.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="flex gap-4 overflow-hidden py-4"
                    >
                      <Link href={`/products/${item.id}`} onClick={cart.closeDrawer} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                        <ProductImage src={item.image} alt={item.name} sizes="80px" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/products/${item.id}`} onClick={cart.closeDrawer} className="line-clamp-2 text-sm font-medium hover:underline">
                            {item.name}
                          </Link>
                          <button type="button" onClick={() => cart.remove(item.id)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${item.name}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="mt-auto flex items-center justify-between">
                          <div className="flex items-center rounded-full border">
                            <button type="button" onClick={() => cart.setQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={`One fewer ${item.name}`}>
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button type="button" onClick={() => cart.setQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= item.stock} className="flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={`One more ${item.name}`}>
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <motion.span key={cart.total} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-lg font-semibold tabular-nums">
                    {formatPrice(cart.total)}
                  </motion.span>
                </div>
                <p className="text-xs text-muted-foreground">Shipping and taxes are calculated at checkout.</p>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button size="lg" className="w-full" onClick={() => void checkout()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <Lock />}
                  {loading ? 'Redirecting to Stripe…' : signedIn ? 'Checkout' : 'Log in to checkout'}
                </Button>
                <DialogPrimitive.Close render={<Link href="/cart" />} nativeButton={false} className={buttonVariants({ variant: 'ghost', className: 'w-full' })}>
                  View full cart
                </DialogPrimitive.Close>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

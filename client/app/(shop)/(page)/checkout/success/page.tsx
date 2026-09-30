'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Clock, CreditCard, Loader2 } from 'lucide-react';
import { api, formatPrice } from '@/lib/api';
import { orderNumber } from '@/lib/customer-orders';
import { buttonVariants } from '@/components/ui/button';
import { useAuth, useCart } from '@/components/Providers';
import type { OrderStatus } from '@/types';

interface ConfirmResponse {
  order: { _id: string; status: OrderStatus; total: number; currency: string };
  checkoutUrl?: string;
}

type State =
  | { kind: 'checking' }
  | { kind: 'paid'; order: ConfirmResponse['order'] }
  | { kind: 'processing' }
  | { kind: 'unpaid'; checkoutUrl?: string }
  | { kind: 'unknown' };

/** Stripe can take a moment to settle some payment methods; ask a few times before giving up. */
const RETRIES = [0, 1500, 3000, 5000];

export default function SuccessPage() {
  return (
    <Suspense fallback={<Checking />}>
      <Success />
    </Suspense>
  );
}

function Checking() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="font-medium">Confirming your payment…</p>
    </div>
  );
}

function Success() {
  const sessionId = useSearchParams().get('session_id');
  const { ready, user } = useAuth();
  const { clear } = useCart();
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    if (!ready) return;
    if (!sessionId || !user) return setState({ kind: 'unknown' });
    let cancelled = false;
    (async () => {
      for (const wait of RETRIES) {
        await new Promise((r) => setTimeout(r, wait));
        if (cancelled) return;
        try {
          const res = await api<ConfirmResponse>('/checkout/confirm', { method: 'POST', auth: true, body: { sessionId } });
          if (res.order.status === 'pending' && res.checkoutUrl) return setState({ kind: 'unpaid', checkoutUrl: res.checkoutUrl });
          if (res.order.status !== 'pending' && res.order.status !== 'cancelled') {
            clear();
            return setState({ kind: 'paid', order: res.order });
          }
        } catch {
          // try again
        }
      }
      if (!cancelled) setState({ kind: 'processing' });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.kind === 'checking') return <Checking />;

  const content = {
    paid: {
      icon: <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />,
      tone: 'bg-emerald-100 dark:bg-emerald-950',
      title: 'Thank you for your order',
      body:
        state.kind === 'paid'
          ? `Order ${orderNumber(state.order._id)} for ${formatPrice(state.order.total, state.order.currency)} is confirmed. We’ve emailed you a receipt and will let you know when it ships.`
          : '',
    },
    processing: {
      icon: <Clock className="size-7 text-amber-600 dark:text-amber-400" />,
      tone: 'bg-amber-100 dark:bg-amber-950',
      title: 'Your payment is processing',
      body: 'Stripe is still confirming it. Your order will appear in your orders as soon as it does; you don’t need to pay again.',
    },
    unpaid: {
      icon: <CreditCard className="size-7 text-amber-600 dark:text-amber-400" />,
      tone: 'bg-amber-100 dark:bg-amber-950',
      title: 'Payment not finished',
      body: 'It looks like the payment didn’t go through. Your cart is still here, and you can finish paying below.',
    },
    unknown: {
      icon: <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />,
      tone: 'bg-emerald-100 dark:bg-emerald-950',
      title: 'Thanks for shopping with us',
      body: 'If your payment went through, your order will appear in your orders shortly.',
    },
  }[state.kind];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-3xl border p-8 text-center"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
        className={`flex size-14 items-center justify-center rounded-full ${content.tone}`}
      >
        {content.icon}
      </motion.span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{content.title}</h1>
        <p className="text-sm text-muted-foreground">{content.body}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {state.kind === 'paid' && (
          <Link href={`/account/orders/${state.order._id}`} className={buttonVariants({ className: 'rounded-full' })}>
            Track your order <ArrowRight />
          </Link>
        )}
        {state.kind === 'unpaid' && state.checkoutUrl && (
          <a href={state.checkoutUrl} className={buttonVariants({ className: 'rounded-full' })}>
            Complete payment <ArrowRight />
          </a>
        )}
        {(state.kind === 'processing' || state.kind === 'unknown') && (
          <Link href="/account/orders" className={buttonVariants({ className: 'rounded-full' })}>
            View your orders
          </Link>
        )}
        <Link href="/shop" className={buttonVariants({ variant: 'outline', className: 'rounded-full' })}>
          Keep shopping
        </Link>
      </div>
    </motion.div>
  );
}

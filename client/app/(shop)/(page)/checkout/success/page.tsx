'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCart } from '@/components/Providers';

export default function SuccessPage() {
  const { clear } = useCart();

  // Payment is confirmed server-side by the Stripe webhook; here we only reset the local cart.
  useEffect(() => {
    clear();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="mx-auto w-full max-w-md text-center">
      <CardHeader className="items-center gap-3">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <CardTitle className="text-xl">Thank you for your order</CardTitle>
        <CardDescription>
          Your payment went through. It can take a few seconds for the order to appear in your
          history.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/account/orders" className={buttonVariants({})}>
          View orders
        </Link>
        <Link href="/shop" className={buttonVariants({ variant: 'outline' })}>
          Keep shopping
        </Link>
      </CardContent>
    </Card>
  );
}

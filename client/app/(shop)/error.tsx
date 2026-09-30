'use client';

import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
        <TriangleAlert className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">We couldn’t load this page. It’s usually temporary, so please try again.</p>
      <div className="flex gap-2">
        <Button onClick={reset} className="rounded-full">
          <RefreshCw /> Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline', className: 'rounded-full' })}>
          Go home
        </Link>
      </div>
    </div>
  );
}

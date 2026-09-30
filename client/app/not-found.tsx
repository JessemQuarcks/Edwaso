import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-8xl font-semibold tracking-tighter text-muted-foreground/40">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">We couldn’t find that page</h1>
      <p className="max-w-sm text-muted-foreground">It may have moved, or the product is no longer available.</p>
      <div className="flex gap-2">
        <Link href="/shop" className={buttonVariants({ className: 'rounded-full' })}>
          Browse the shop
        </Link>
        <Link href="/" className={buttonVariants({ variant: 'outline', className: 'rounded-full' })}>
          Home
        </Link>
      </div>
    </div>
  );
}

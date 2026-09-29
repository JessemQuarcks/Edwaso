'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth, useCart } from './Providers';

export default function Header() {
  const { user, ready, logout } = useAuth();
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Shop
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/cart"
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'relative' })}
          >
            <ShoppingCart />
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <Badge
                variant="default"
                className="ml-1 h-5 min-w-5 justify-center px-1.5 tabular-nums"
              >
                {count}
              </Badge>
            )}
          </Link>

          {ready && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              {user ? (
                <>
                  <Link href="/orders" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Orders
                  </Link>
                  {user.isAdmin && (
                    <Link
                      href="/admin"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      Admin
                    </Link>
                  )}
                  <Button variant="outline" size="sm" onClick={logout}>
                    <span className="max-w-24 truncate">{user.name}</span>
                    <span className="text-muted-foreground">· Log out</span>
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Log in
                  </Link>
                  <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                    Register
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

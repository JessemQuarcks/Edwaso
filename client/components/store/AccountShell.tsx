'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { KeyRound, LogOut, Package, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../Providers';

const NAV = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/password', label: 'Password', icon: KeyRound },
];

/** Account pages: side navigation, and a redirect to log in for visitors. */
export default function AccountShell({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, pathname, router]);

  if (!ready || !user) {
    return (
      <div className="grid gap-8 md:grid-cols-[220px_1fr]" aria-busy="true">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const active = (href: string) => (href === '/account' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex flex-col gap-8">
      <div className="print:hidden">
        <p className="text-sm text-muted-foreground">My account</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hi, {user.name.split(' ')[0]}</h1>
      </div>
      <div className="grid gap-8 md:grid-cols-[220px_1fr] print:block">
        <nav className="flex gap-1 overflow-x-auto md:flex-col print:hidden" aria-label="Account">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? 'page' : undefined}
              className={cn('relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors', active(href) ? 'font-medium' : 'text-muted-foreground hover:text-foreground')}
            >
              {active(href) && <motion.span layoutId="account-nav" className="absolute inset-0 rounded-xl bg-muted" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <Icon className="relative size-4" />
              <span className="relative">{label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              logout();
              router.push('/');
            }}
            className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

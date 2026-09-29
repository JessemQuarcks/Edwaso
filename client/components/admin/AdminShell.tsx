'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ExternalLink, Loader2, LogOut, Package, ShieldCheck, UserCog, Users } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import type { AdminRole, AdminUser } from '@/types/admin';

const AdminContext = createContext<AdminUser | null>(null);

/** The signed-in admin. Only valid inside the (console) layout. */
export function useAdmin(): AdminUser {
  const user = useContext(AdminContext);
  if (!user) throw new Error('useAdmin must be used inside <AdminShell>');
  return user;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Package;
  roles?: AdminRole[];
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Catalog & orders', icon: Package },
  { href: '/admin/team', label: 'Team', icon: Users, roles: ['owner', 'admin'] },
  { href: '/admin/security', label: 'Account & security', icon: UserCog },
];

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));

  async function signOut() {
    setSigningOut(true);
    await adminApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <AdminContext.Provider value={user}>
      <div className="flex min-h-svh flex-col lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 border-b bg-background p-3 lg:sticky lg:top-0 lg:h-svh lg:w-60 lg:border-r lg:border-b-0 lg:p-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ShieldCheck className="size-4" />
              Shop Admin
            </Link>
            <div className="lg:hidden">
              <ThemeToggle />
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
            {items.map(({ href, label, icon: Icon }) => {
              const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden flex-col gap-3 lg:flex">
            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-2 px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-4" />
              View store
            </Link>
            <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <Badge variant="secondary" className="mt-0.5 capitalize">
                  {user.role}
                </Badge>
              </div>
              <ThemeToggle />
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Account controls live in the sidebar on large screens. */}
          <div className="flex items-center justify-end gap-2 border-b bg-background px-4 py-2 lg:hidden">
            <span className="truncate text-sm text-muted-foreground">{user.name}</span>
            <Button variant="outline" size="sm" onClick={() => void signOut()} disabled={signingOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

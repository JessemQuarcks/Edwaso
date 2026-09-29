'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { initials } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ThemeToggle from '@/components/ThemeToggle';
import { NotificationsBell, NotificationsProvider, useNotifications } from './AdminNotifications';
import Toaster from './Toaster';
import { EASE_OUT } from './motion';
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
  badge?: 'awaitingShipment';
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Main menu',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutGrid },
      { href: '/admin/orders', label: 'Orders', icon: ShoppingCart, badge: 'awaitingShipment' },
      { href: '/admin/products', label: 'Products', icon: Package },
      { href: '/admin/customers', label: 'Customers', icon: Users },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Store',
    items: [
      { href: '/admin/team', label: 'Team', icon: UsersRound, roles: ['owner', 'admin'] },
      { href: '/admin/security', label: 'Account & security', icon: ShieldCheck },
    ],
  },
];

/** Title and subtitle for the top bar, by section. */
const SECTIONS: Record<string, { title: string; description: string }> = {
  orders: { title: 'Orders', description: 'Track, fulfil and export orders.' },
  products: { title: 'Products', description: 'Your catalog, prices and stock.' },
  customers: { title: 'Customers', description: 'Everyone who shops with you.' },
  analytics: { title: 'Analytics', description: 'How the store is performing over time.' },
  team: { title: 'Team', description: 'Staff accounts and invites.' },
  security: { title: 'Account & security', description: 'Your password, two-factor and sessions.' },
};

const isActive = (pathname: string, href: string) =>
  href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

const COLLAPSED_KEY = 'admin-sidebar-collapsed';

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingBag className="size-4" />
      </span>
      {!collapsed && <span className="truncate text-base font-semibold tracking-tight">Shop Admin</span>}
    </Link>
  );
}

function NavLinks({
  role,
  collapsed,
  layoutId,
  onNavigate,
}: {
  role: AdminRole;
  collapsed: boolean;
  /** Distinct per sidebar instance so the desktop and mobile pills don't animate between each other. */
  layoutId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data } = useNotifications();

  return (
    <nav className="flex flex-col gap-5" aria-label="Admin">
      {NAV.map((section) => {
        const items = section.items.filter((i) => !i.roles || i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={section.title} className="flex flex-col gap-1">
            <p
              className={cn(
                'px-3 pb-1 text-xs font-medium text-muted-foreground transition-opacity',
                collapsed && 'sr-only'
              )}
            >
              {section.title}
            </p>
            {items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(pathname, href);
              const count = badge ? (data?.[badge] ?? 0) : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={layoutId}
                      className="absolute inset-0 rounded-lg bg-muted"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon className="relative size-4 shrink-0" />
                  {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
                  {count > 0 && (
                    <span
                      className={cn(
                        'relative rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive tabular-nums',
                        collapsed && 'absolute top-0.5 right-1 size-2 p-0 text-[0px] bg-destructive'
                      )}
                    >
                      {count}
                      {collapsed && <span className="sr-only"> orders to ship</span>}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function StoreLink({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      target="_blank"
      title={collapsed ? 'View store' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <ExternalLink className="size-4 shrink-0" />
      {!collapsed && 'View store'}
    </Link>
  );
}

function useGreeting(name: string) {
  // Time-dependent text is set after mount so server and client markup match.
  const [state, setState] = useState<{ greeting: string; date: string } | null>(null);
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    setState({
      greeting: `Good ${part}, ${name.split(' ')[0]}!`,
      date: now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    });
  }, [name]);
  return state;
}

function UserMenu({ user }: { user: AdminUser }) {
  const router = useRouter();

  async function signOut() {
    await adminApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(user.name)}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground capitalize">{user.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/admin/security" />}>
          <ShieldCheck />
          Account & security
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/" target="_blank" />}>
          <ExternalLink />
          View store
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Topbar({ user, onOpenMenu }: { user: AdminUser; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const section = pathname.split('/')[2];
  const info = section ? SECTIONS[section] : undefined;
  const greeting = useGreeting(user.name);

  const title = info?.title ?? greeting?.greeting ?? 'Welcome back';
  const description = info?.description ?? 'Here’s what’s happening with your store.';

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu />
      </Button>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="min-w-0 flex-1"
        >
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          <p className="hidden truncate text-sm text-muted-foreground sm:block">{description}</p>
        </motion.div>
      </AnimatePresence>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {greeting && (
          <span className="mr-1 hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm md:flex">
            <CalendarDays className="size-4 text-muted-foreground" />
            {greeting.date}
          </span>
        )}
        <ThemeToggle />
        <NotificationsBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

export default function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage unavailable: start expanded.
    }
  }, []);

  // Close the drawer on navigation or Escape.
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // Not persisted; fine.
      }
      return !c;
    });
  }

  return (
    <AdminContext.Provider value={user}>
      <MotionConfig reducedMotion="user">
        <NotificationsProvider>
          <Toaster>
            <div className="flex min-h-svh">
              {/* Desktop sidebar */}
              <motion.aside
                animate={{ width: collapsed ? 76 : 256 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="sticky top-0 hidden h-svh shrink-0 flex-col gap-6 border-r bg-background px-3 py-5 lg:flex"
              >
                <div className={cn('flex items-center px-2', collapsed ? 'justify-center' : 'justify-between')}>
                  <Brand collapsed={collapsed} />
                </div>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className="absolute top-6 -right-3 z-10 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3 }}>
                    <ChevronLeft className="size-3.5" />
                  </motion.span>
                </button>
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <NavLinks role={user.role} collapsed={collapsed} layoutId="nav-active-desktop" />
                </div>
                <StoreLink collapsed={collapsed} />
              </motion.aside>

              {/* Mobile drawer */}
              <AnimatePresence>
                {mobileOpen && (
                  <>
                    <motion.div
                      className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setMobileOpen(false)}
                    />
                    <motion.aside
                      className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-background px-3 py-5 shadow-xl lg:hidden"
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '-100%' }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Menu"
                    >
                      <div className="flex items-center justify-between px-2">
                        <Brand />
                        <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                          <X />
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <NavLinks
                          role={user.role}
                          collapsed={false}
                          layoutId="nav-active-mobile"
                          onNavigate={() => setMobileOpen(false)}
                        />
                      </div>
                      <StoreLink collapsed={false} />
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>

              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar user={user} onOpenMenu={() => setMobileOpen(true)} />
                <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
              </div>
            </div>
          </Toaster>
        </NotificationsProvider>
      </MotionConfig>
    </AdminContext.Provider>
  );
}

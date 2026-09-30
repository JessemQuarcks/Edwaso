'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, LogOut, Menu, Package, Search, ShoppingBag, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ThemeToggle from './ThemeToggle';
import CartDrawer from './store/CartDrawer';
import ProductImage from './store/ProductImage';
import { EASE_OUT } from './store/motion';
import { useAuth, useCart, useStore } from './Providers';
import type { CategoryInfo } from '@/types';

function SearchForm({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop');
    setQ('');
    onDone?.();
  }
  return (
    <form onSubmit={submit} role="search" className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products"
        aria-label="Search products"
        autoFocus={autoFocus}
        className="h-9 w-full rounded-full border bg-muted/50 pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus-visible:ring-3 focus-visible:ring-ring/40"
      />
    </form>
  );
}

function CategoriesMenu({ categories }: { categories: CategoryInfo[] }) {
  if (categories.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'gap-1' })}>
        Categories <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(560px,calc(100vw-2rem))] p-3">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {categories.map((c) => (
            <PopoverClose
              key={c.slug}
              nativeButton={false}
              render={<Link href={`/shop?category=${c.slug}`} />}
              className="group flex items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
            >
              <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                <ProductImage src={c.image} alt="" sizes="40px" className="transition-transform duration-300 group-hover:scale-110" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                {c.count !== undefined && <span className="text-xs text-muted-foreground">{c.count} {c.count === 1 ? 'item' : 'items'}</span>}
              </span>
            </PopoverClose>
          ))}
        </div>
        <PopoverClose nativeButton={false} render={<Link href="/shop" />} className="mt-2 block rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-muted">
          Shop everything →
        </PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu() {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  if (!ready) return <span className="size-9" />;
  if (!user) {
    return (
      <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <User /> <span className="hidden sm:inline">Log in</span>
      </Link>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label="Account menu">
        <User /> <span className="hidden max-w-24 truncate sm:inline">{user.name.split(' ')[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/account" />}>
          <User /> My account
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/account/orders" />}>
          <Package /> Orders
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            logout();
            router.push('/');
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Orders, next to the cart. The badge counts orders still on their way. */
function OrdersButton() {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!user) return setActive(0);
    let live = true;
    api<{ active: number }>('/orders/mine/summary', { auth: true })
      .then((d) => live && setActive(d.active))
      .catch(() => undefined); // just a badge
    return () => {
      live = false;
    };
  }, [user, pathname]);

  const href = user || !ready ? '/account/orders' : '/login?next=/account/orders';
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'relative' })}
      aria-label={active ? `Orders, ${active} on the way` : 'Orders'}
    >
      <Package />
      <span className="hidden sm:inline">Orders</span>
      <AnimatePresence>
        {active > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background tabular-nums"
          >
            {active}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

function CartButton() {
  const { count, bump, openDrawer } = useCart();
  return (
    <Button variant="ghost" size="sm" className="relative" onClick={openDrawer} aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
      <motion.span key={bump} animate={bump ? { rotate: [0, -14, 12, -6, 0], scale: [1, 1.15, 1] } : undefined} transition={{ duration: 0.5 }} className="flex">
        <ShoppingBag />
      </motion.span>
      <span className="hidden sm:inline">Cart</span>
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={`${count}-${bump}`}
            initial={{ scale: 0.3, y: -6 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground tabular-nums"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

export default function Header({ categories }: { categories: CategoryInfo[] }) {
  const { storeName, storefront } = useStore();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ticking = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMobileOpen(false), [pathname]);
  // While the menu is open: Escape closes it, focus starts on the close button and the page behind stays put.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen]);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        ticking.current = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <AnimatePresence initial={false}>
        {storefront.announcement && !dismissed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-foreground text-background print:hidden">
            <div className="relative mx-auto flex max-w-7xl items-center justify-center px-10 py-2 text-center text-xs font-medium sm:text-sm">
              {storefront.announcement}
              <button type="button" onClick={() => setDismissed(true)} className="absolute right-3 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss announcement">
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header
        className={cn(
          'sticky top-0 z-40 w-full border-b border-transparent transition-[background-color,border-color,box-shadow] duration-300 print:hidden',
          scrolled ? 'border-border bg-background/85 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70' : 'bg-background'
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link href="/" className="mr-2 flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <ShoppingBag className="size-4" />
            </span>
            <span className="hidden truncate sm:inline">{storeName}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            <Link href="/shop" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Shop
            </Link>
            <CategoriesMenu categories={categories} />
          </nav>

          <div className="ml-auto hidden w-full max-w-xs lg:block">
            <SearchForm />
          </div>

          <div className="ml-auto flex items-center gap-0.5 lg:ml-2">
            <Link href="/shop" className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'lg:hidden' })} aria-label="Search">
              <Search />
            </Link>
            <ThemeToggle />
            <AccountMenu />
            <OrdersButton />
            <CartButton />
          </div>
        </div>
      </header>

      <CartDrawer />

      {/* Mobile navigation */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.nav
              className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-background p-5 shadow-2xl md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              aria-label="Menu"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{storeName}</span>
                <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                  <X />
                </Button>
              </div>
              <SearchForm onDone={() => setMobileOpen(false)} />
              <div className="flex flex-col gap-1">
                <Link href="/" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">
                  Home
                </Link>
                <Link href="/shop" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">
                  Shop all
                </Link>
                <Link href="/account/orders" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">
                  Orders &amp; tracking
                </Link>
                <Link href="/account" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">
                  My account
                </Link>
              </div>
              {categories.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Categories</p>
                  {categories.map((c) => (
                    <Link key={c.slug} href={`/shop?category=${c.slug}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted">
                      <span className="relative size-8 overflow-hidden rounded-md bg-muted">
                        <ProductImage src={c.image} alt="" sizes="32px" />
                      </span>
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

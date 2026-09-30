'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CornerDownLeft, Loader2, Package, Receipt, Search, User } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { useDebounced } from '@/lib/use-admin-query';
import { formatPrice, orderNumber } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import type { SearchResponse } from '@/types/admin';

export interface PaletteLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface Item {
  key: string;
  group: string;
  href: string;
  label: string;
  hint?: React.ReactNode;
  icon: ComponentType<{ className?: string }>;
}

/** ⌘K / Ctrl+K: jump to a page, order, product or customer. */
export default function CommandPalette({ pages, open, onOpenChange }: { pages: PaletteLink[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 200);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    let stale = false;
    setLoading(true);
    adminApi<SearchResponse>(`/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => !stale && setResults(r))
      .catch(() => !stale && setResults(null))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [debounced]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pageItems = pages
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .map((p) => ({ key: `page-${p.href}`, group: 'Pages', href: p.href, label: p.label, icon: p.icon }));
    if (!results) return pageItems;
    return [
      ...results.orders.map((o) => ({
        key: `o-${o._id}`,
        group: 'Orders',
        href: `/admin/orders/${o._id}`,
        label: `${orderNumber(o._id)} · ${o.user?.name ?? 'Deleted customer'}`,
        hint: (
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{formatPrice(o.total)}</span>
            <OrderStatusBadge status={o.status} />
          </span>
        ),
        icon: Receipt,
      })),
      ...results.products.map((p) => ({
        key: `p-${p._id}`,
        group: 'Products',
        href: `/admin/products/${p._id}`,
        label: p.name,
        hint: p.sku ?? (p.status !== 'active' ? p.status : undefined),
        icon: Package,
      })),
      ...results.customers.map((c) => ({ key: `c-${c._id}`, group: 'Customers', href: `/admin/customers/${c._id}`, label: c.name, hint: c.email, icon: User })),
      ...pageItems,
    ];
  }, [pages, query, results]);

  useEffect(() => setActive(0), [items.length, query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    onOpenChange(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    }
  }

  let lastGroup = '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0" showClose={false}>
        <DialogTitle className="sr-only">Search the admin console</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search orders, products, customers or pages…"
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={items[active] ? `palette-${items[active]!.key}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-results" role="listbox" className="max-h-96 overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {debounced.length >= 2 && !loading ? 'Nothing found.' : 'Type at least two characters to search.'}
            </p>
          )}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {header && <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</p>}
                <button
                  type="button"
                  id={`palette-${item.key}`}
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                    index === active && 'bg-muted'
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                  {index === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowRight className="size-3 rotate-90" />
            <ArrowRight className="size-3 -rotate-90" /> to move
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="size-3" /> to open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

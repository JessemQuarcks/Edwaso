'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, PackageOpen, Truck } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { formatPrice, timeAgo } from '@/lib/admin-format';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buttonVariants } from '@/components/ui/button';
import type { NotificationsResponse } from '@/types/admin';

interface NotificationsValue {
  data: NotificationsResponse | null;
  /** Call after an action that changes the counts (e.g. shipping an order). */
  refresh: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}

const POLL_MS = 60_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NotificationsResponse | null>(null);

  const refresh = useCallback(() => {
    adminApi<NotificationsResponse>('/notifications')
      .then(setData)
      .catch(() => undefined); // The badge is a nicety; pages surface real errors.
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return <NotificationsContext.Provider value={{ data, refresh }}>{children}</NotificationsContext.Provider>;
}

/** The bell in the top bar. */
export function NotificationsBell() {
  const { data } = useNotifications();
  const count = (data?.awaitingShipment ?? 0) + (data?.lowStockCount ?? 0);

  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative' })}
        aria-label={count ? `Notifications, ${count} need attention` : 'Notifications'}
      >
        <Bell />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              key={count}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums"
            >
              {count > 99 ? '99+' : count}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent className="w-88 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-muted-foreground">What needs your attention</p>
        </div>
        <div className="flex max-h-96 flex-col overflow-y-auto p-2">
          {data && data.awaitingShipment > 0 && (
            <PopoverClose
              nativeButton={false}
              render={<Link href="/admin/orders?status=paid" />}
              className="flex items-start gap-3 rounded-lg p-2 text-left hover:bg-muted"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Truck className="size-4" />
              </span>
              <span className="text-sm">
                <span className="font-medium">
                  {data.awaitingShipment} {data.awaitingShipment === 1 ? 'order is' : 'orders are'} waiting to ship
                </span>
                <span className="block text-xs text-muted-foreground">Paid and ready for fulfilment</span>
              </span>
            </PopoverClose>
          )}
          {data?.lowStock.map((p) => (
            <PopoverClose
              key={p._id}
              nativeButton={false}
              render={<Link href={`/admin/products/${p._id}`} />}
              className="flex items-start gap-3 rounded-lg p-2 text-left hover:bg-muted"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <PackageOpen className="size-4" />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.stock === 0 ? 'Out of stock' : `Only ${p.stock} left in stock`}
                </span>
              </span>
            </PopoverClose>
          ))}
          {data && data.recentOrders.length > 0 && (
            <>
              <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">Sales in the last 24 hours</p>
              {data.recentOrders.map((o) => (
                <PopoverClose
                  key={o._id}
                  nativeButton={false}
                  render={<Link href={`/admin/orders/${o._id}`} />}
                  className="flex items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                >
                  <span className="truncate">{o.user?.name ?? 'Deleted customer'}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular-nums">{formatPrice(o.total)}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(o.paidAt)}</span>
                  </span>
                </PopoverClose>
              ))}
            </>
          )}
          {data && count === 0 && data.recentOrders.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">You’re all caught up.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCircle2, PackageOpen, PackageX, ShoppingBag, TriangleAlert, Truck, type LucideIcon } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { timeAgo } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buttonVariants } from '@/components/ui/button';
import type { AdminNotification, NotificationType, NotificationsResponse } from '@/types/admin';

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

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  order_paid: { icon: ShoppingBag, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  low_stock: { icon: PackageOpen, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  out_of_stock: { icon: PackageX, tone: 'bg-destructive/10 text-destructive' },
  webhook_failed: { icon: TriangleAlert, tone: 'bg-destructive/10 text-destructive' },
};

const ROW = 'flex items-start gap-3 rounded-lg p-2 text-left';

/** The bell in the top bar: what needs attention now, and a feed of recent events. */
export function NotificationsBell() {
  const { data, refresh } = useNotifications();
  const unread = data?.unread ?? 0;
  // Which items were unread when the menu opened, so they stay highlighted while it's open.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  function onOpenChange(open: boolean) {
    if (!open || !data) return;
    setFresh(new Set(data.feed.filter((n) => !n.read).map((n) => n._id)));
    if (data.unread > 0) {
      adminApi('/notifications/read', { method: 'POST', body: {} })
        .then(refresh)
        .catch(() => undefined);
    }
  }

  const attention = (data?.awaitingShipment ?? 0) > 0 || (data?.lowStock.length ?? 0) > 0;

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative' })}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums"
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <PopoverClose
            nativeButton={false}
            render={<Link href="/admin/security#email-alerts" />}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Email settings
          </PopoverClose>
        </div>
        <div className="flex max-h-[28rem] flex-col overflow-y-auto p-2">
          {attention && data && (
            <>
              <p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Needs attention</p>
              {data.awaitingShipment > 0 && (
                <PopoverClose nativeButton={false} render={<Link href="/admin/orders?status=paid" />} className={cn(ROW, 'hover:bg-muted')}>
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
              {data.lowStockCount > 0 && (
                <PopoverClose nativeButton={false} render={<Link href="/admin/products?tab=low" />} className={cn(ROW, 'hover:bg-muted')}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <PackageOpen className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">
                      {data.lowStockCount} {data.lowStockCount === 1 ? 'product is' : 'products are'} low on stock
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {data.lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}
                    </span>
                  </span>
                </PopoverClose>
              )}
            </>
          )}

          {data && data.feed.length > 0 && (
            <>
              <p className={cn('px-2 pb-1 text-xs font-medium text-muted-foreground', attention ? 'pt-3' : 'pt-1')}>Activity</p>
              <ul className="flex flex-col">
                {data.feed.map((n, i) => (
                  <motion.li key={n._id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                    <FeedItem n={n} fresh={fresh.has(n._id) || !n.read} />
                  </motion.li>
                ))}
              </ul>
            </>
          )}

          {data && !attention && data.feed.length === 0 && (
            <p className="flex flex-col items-center gap-2 px-2 py-10 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-6" />
              You’re all caught up.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FeedItem({ n, fresh }: { n: AdminNotification; fresh: boolean }) {
  const { icon: Icon, tone } = ICONS[n.type];
  const content = (
    <>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex items-start justify-between gap-2">
          <span className={cn('font-medium', !fresh && 'text-foreground/80')}>{n.title}</span>
          {fresh && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
        </span>
        {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {timeAgo(n.createdAt)}
          {n.resolvedAt && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> Resolved
            </span>
          )}
        </span>
      </span>
    </>
  );
  const className = cn(ROW, fresh && 'bg-primary/[0.04]');
  return n.link ? (
    <PopoverClose nativeButton={false} render={<Link href={n.link} />} className={cn(className, 'hover:bg-muted')}>
      {content}
    </PopoverClose>
  ) : (
    <div className={className}>{content}</div>
  );
}

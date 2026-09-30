'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2, Package } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { useAuth } from '@/components/Providers';
import { Reveal } from '@/components/store/motion';
import type { MeResponse, Order, OrdersResponse } from '@/types';

const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);

export default function AccountPage() {
  const { user, setSession } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    api<OrdersResponse>('/orders/mine', { auth: true })
      .then((d) => setOrders(d.orders))
      .catch(() => setOrders([]));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api<MeResponse>('/auth/me', { method: 'PATCH', auth: true, body: { name } });
      setSession(res.user);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const recent = orders?.slice(0, 3);
  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How we address you on orders and emails.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid max-w-md gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} readOnly disabled />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving || name === user?.name}>
                  {saving && <Loader2 className="animate-spin" />}
                  Save
                </Button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" /> Saved
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={0.08}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Track deliveries and see what you’ve bought.</CardDescription>
            </div>
            <Link href="/account/orders" className="group flex items-center gap-1 text-sm font-medium">
              All orders <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!recent && <Skeleton className="h-16 rounded-xl" />}
            {recent?.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="size-4" /> No orders yet.{' '}
                <Link href="/shop" className="font-medium text-foreground underline underline-offset-4">
                  Start shopping
                </Link>
              </p>
            )}
            {recent?.map((o) => (
              <Link key={o._id} href={`/account/orders/${o._id}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block font-medium">#{o._id.slice(-8).toUpperCase()}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status} customer />
                  <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

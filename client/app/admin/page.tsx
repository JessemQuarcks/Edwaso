'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, errorMessage, formatPrice } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { useAuth } from '@/components/Providers';
import type { Order, OrderStatus, OrdersResponse, Product, ProductsResponse } from '@/types';

// The form holds strings (raw input values); numbers are parsed on submit.
interface ProductForm {
  name: string;
  description: string;
  /** Dollars, as typed by the admin. Converted to cents for the API. */
  price: string;
  image: string;
  category: string;
  stock: string;
}

const EMPTY: ProductForm = {
  name: '',
  description: '',
  price: '',
  image: '',
  category: 'general',
  stock: '',
};

// 'pending' is system-managed (set at checkout, cleared by the webhook).
const SETTABLE_STATUSES: OrderStatus[] = ['paid', 'shipped', 'cancelled'];

const customerEmail = (order: Order): string =>
  typeof order.user === 'string' ? order.user : order.user.email;

export default function AdminPage() {
  const { user, ready } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([
        api<ProductsResponse>('/products?limit=50'),
        api<OrdersResponse>('/orders', { auth: true }),
      ]);
      setProducts(p.products);
      setOrders(o.orders);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void load();
  }, [user, load]);

  if (!ready) return null;

  if (!user?.isAdmin) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-20 text-center">
        <Lock className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">You need an admin account to view this page.</p>
        <Link href="/login?next=/admin" className={buttonVariants({ size: 'sm' })}>
          Log in
        </Link>
      </div>
    );
  }

  const set =
    (key: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = {
      ...form,
      price: Math.round(parseFloat(form.price) * 100),
      stock: parseInt(form.stock, 10),
    };
    try {
      if (editingId) await api(`/products/${editingId}`, { method: 'PUT', auth: true, body });
      else await api('/products', { method: 'POST', auth: true, body });
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function edit(p: Product) {
    setEditingId(p._id);
    setForm({
      name: p.name,
      description: p.description,
      price: (p.price / 100).toFixed(2),
      image: p.image,
      category: p.category,
      stock: String(p.stock),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE', auth: true });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function setStatus(id: string, status: OrderStatus) {
    try {
      await api(`/orders/${id}/status`, { method: 'PATCH', auth: true, body: { status } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage the catalog and fulfil orders.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit product' : 'Add product'}</CardTitle>
          <CardDescription>
            Prices are entered in dollars and stored as integer cents.
          </CardDescription>
        </CardHeader>

        <form onSubmit={save}>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" required value={form.name} onChange={set('name')} />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" rows={3} value={form.description} onChange={set('description')} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="p-price">Price (USD)</Label>
              <Input
                id="p-price"
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="49.99"
                value={form.price}
                onChange={set('price')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="p-stock">Stock</Label>
              <Input
                id="p-stock"
                required
                type="number"
                min="0"
                step="1"
                placeholder="25"
                value={form.stock}
                onChange={set('stock')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="p-category">Category</Label>
              <Input id="p-category" value={form.category} onChange={set('category')} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="p-image">Image URL</Label>
              <Input
                id="p-image"
                type="url"
                placeholder="https://…"
                value={form.image}
                onChange={set('image')}
              />
            </div>
          </CardContent>

          <CardFooter className="mt-6 gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : editingId ? <Pencil /> : <Plus />}
              {editingId ? 'Update product' : 'Create product'}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY);
                }}
              >
                <X />
                Cancel
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>{products.length} in the catalog.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(p.price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => edit(p)}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => void remove(p._id)}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40">Change status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customerEmail(o)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(o.total)}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={o.status}
                        onValueChange={(v) => void setStatus(o._id, v as OrderStatus)}
                      >
                        <SelectTrigger size="sm" className="w-36 capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {o.status === 'pending' && (
                            <SelectItem value="pending" disabled>
                              pending
                            </SelectItem>
                          )}
                          {SETTABLE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

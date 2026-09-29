'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ImageOff, Loader2, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FormError from './FormError';
import { useNotifications } from './AdminNotifications';
import { useToast } from './Toaster';
import { Stagger, StaggerItem } from './motion';
import type { AdminProduct } from '@/types/admin';
import type { CategoriesResponse } from '@/types';

// Raw input values; numbers are parsed on submit.
interface Form {
  name: string;
  description: string;
  /** Dollars, as typed. Sent to the API as integer cents. */
  price: string;
  stock: string;
  category: string;
  image: string;
}

const EMPTY: Form = { name: '', description: '', price: '', stock: '', category: 'general', image: '' };

const toForm = (p: AdminProduct): Form => ({
  name: p.name,
  description: p.description,
  price: (p.price / 100).toFixed(2),
  stock: String(p.stock),
  category: p.category,
  image: p.image,
});

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** Create or edit a product, with a live preview of the storefront card. */
export default function ProductEditor({ product }: { product?: AdminProduct }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useNotifications();
  const [form, setForm] = useState<Form>(product ? toForm(product) : EMPTY);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    api<CategoriesResponse>('/products/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, []);
  useEffect(() => setImageBroken(false), [form.image]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description,
      price: Math.round(parseFloat(form.price) * 100),
      stock: parseInt(form.stock, 10),
      category: form.category.trim().toLowerCase() || 'general',
      image: form.image.trim(),
    };
    try {
      if (product) {
        await adminApi(`/products/${product._id}`, { method: 'PUT', body });
        toast('Product saved', { description: form.name });
      } else {
        await adminApi('/products', { method: 'POST', body });
        toast('Product created', { description: form.name });
      }
      refresh();
      router.push('/admin/products');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!product || !confirm(`Delete “${product.name}”? Past orders keep their copy of it.`)) return;
    setDeleting(true);
    try {
      await adminApi(`/products/${product._id}`, { method: 'DELETE' });
      toast('Product deleted', { description: product.name });
      refresh();
      router.push('/admin/products');
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  const price = parseFloat(form.price);
  const stock = parseInt(form.stock, 10);
  const showImage = isHttpUrl(form.image) && !imageBroken;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/products" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{product ? 'Edit product' : 'New product'}</h2>
          {product && (
            <p className="text-sm text-muted-foreground">{formatNumber(product.sold)} sold to date</p>
          )}
        </div>
      </div>

      <form onSubmit={save}>
        <Stagger className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-6">
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                  <CardDescription>What customers see on the store.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="p-name">Name</Label>
                    <Input id="p-name" required maxLength={200} value={form.name} onChange={set('name')} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="p-desc">Description</Label>
                    <Textarea id="p-desc" rows={5} maxLength={5000} value={form.description} onChange={set('description')} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="p-image">Image URL</Label>
                    <Input
                      id="p-image"
                      type="url"
                      placeholder="https://…"
                      value={form.image}
                      onChange={set('image')}
                      aria-describedby="p-image-help"
                    />
                    <p id="p-image-help" className="text-xs text-muted-foreground">
                      A direct link to an http(s) image. Uploads are coming later.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Pricing & inventory</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="p-price">Price (USD)</Label>
                    <Input
                      id="p-price"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
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
                      inputMode="numeric"
                      placeholder="25"
                      value={form.stock}
                      onChange={set('stock')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="p-category">Category</Label>
                    <Input id="p-category" list="p-categories" maxLength={60} value={form.category} onChange={set('category')} />
                    <datalist id="p-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <FormError message={error} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              {product ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => void remove()} disabled={deleting}>
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete product
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Link href="/admin/products" className="inline-flex h-8 items-center rounded-lg px-3 text-sm hover:bg-muted">
                  Cancel
                </Link>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {product ? 'Save changes' : 'Create product'}
                </Button>
              </div>
            </div>
          </div>

          {/* Live preview of the storefront card */}
          <StaggerItem className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Preview</p>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="relative aspect-square bg-muted">
                <AnimatePresence mode="wait">
                  {showImage ? (
                    <motion.img
                      key={form.image}
                      src={form.image}
                      alt=""
                      onError={() => setImageBroken(true)}
                      className="size-full object-cover"
                      initial={{ opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                    />
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
                    >
                      <ImageOff className="size-8" />
                      {imageBroken ? 'Image couldn’t be loaded' : 'No image yet'}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-col gap-1.5 p-4">
                <Badge variant="secondary" className="w-fit capitalize">
                  {form.category || 'general'}
                </Badge>
                <p className="truncate font-medium">{form.name || 'Product name'}</p>
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {form.description || 'A short description helps customers decide.'}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-semibold">{Number.isFinite(price) ? formatPrice(Math.round(price * 100)) : '$—'}</span>
                  <span className="text-xs text-muted-foreground">
                    {Number.isFinite(stock) ? (stock === 0 ? 'Out of stock' : `${stock} in stock`) : ''}
                  </span>
                </div>
              </div>
            </Card>
          </StaggerItem>
        </Stagger>
      </form>
    </div>
  );
}

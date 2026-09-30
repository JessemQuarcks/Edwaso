'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Archive, ImageOff, Loader2, Save, Star, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FormError from './FormError';
import ImageGallery from './ImageGallery';
import StockPanel from './StockPanel';
import { useNotifications } from './AdminNotifications';
import { useToast } from './Toaster';
import { SELECT_CLASS, Segmented } from './kit';
import { Stagger, StaggerItem } from './motion';
import type { AdminProduct, Category } from '@/types/admin';

type Status = AdminProduct['status'];

// Raw input values; money is typed in decimal and sent as integer cents.
interface Form {
  name: string;
  description: string;
  images: string[];
  price: string;
  compareAtPrice: string;
  costPrice: string;
  sku: string;
  stock: string;
  category: string;
  featured: boolean;
  status: Status;
}

const EMPTY: Form = {
  name: '',
  description: '',
  images: [],
  price: '',
  compareAtPrice: '',
  costPrice: '',
  sku: '',
  stock: '',
  category: 'general',
  featured: false,
  status: 'active',
};

const dollars = (c?: number) => (c === undefined || c === null ? '' : (c / 100).toFixed(2));
const cents = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v) * 100));

const toForm = (p: AdminProduct): Form => ({
  name: p.name,
  description: p.description,
  images: p.images?.length ? p.images : p.image ? [p.image] : [],
  price: dollars(p.price),
  compareAtPrice: dollars(p.compareAtPrice),
  costPrice: dollars(p.costPrice),
  sku: p.sku ?? '',
  stock: String(p.stock),
  category: p.category,
  featured: p.featured ?? false,
  status: p.status ?? 'active',
});

const NEW_CATEGORY = '__new__';

/** Create or edit a product, with a live preview of the storefront card and (when editing) inventory. */
export default function ProductEditor({ product }: { product?: AdminProduct }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useNotifications();
  const [form, setForm] = useState<Form>(product ? toForm(product) : EMPTY);
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    adminApi<{ categories: Category[] }>('/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, []);
  const mainImage = form.images[0];
  useEffect(() => setImageBroken(false), [mainImage]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const bind = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const category = form.category === NEW_CATEGORY ? newCategory.trim() : form.category;
    if (!category) return setError('Name the new category');
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description,
      images: form.images,
      price: cents(form.price) ?? 0,
      compareAtPrice: cents(form.compareAtPrice),
      costPrice: cents(form.costPrice),
      sku: form.sku.trim(),
      category,
      featured: form.featured,
      status: form.status,
      // Stock is only set on create; afterwards it changes through recorded adjustments.
      ...(product ? {} : { stock: parseInt(form.stock || '0', 10) }),
    };
    try {
      if (product) {
        await adminApi(`/products/${product._id}`, { method: 'PUT', body });
        toast('Product saved', { description: form.name });
      } else {
        const res = await adminApi<{ product: AdminProduct }>('/products', { method: 'POST', body });
        toast('Product created', { description: form.name });
        router.replace(`/admin/products/${res.product._id}`);
      }
      refresh();
      if (product) router.push('/admin/products');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    if (product.sold > 0) {
      if (!confirm(`Archive “${product.name}”? It has sold before, so it’s kept for order history but hidden from the store.`)) return;
      setDeleting(true);
      try {
        await adminApi(`/products/${product._id}`, { method: 'PUT', body: { status: 'archived' } });
        toast('Product archived', { description: product.name });
        router.push('/admin/products');
      } catch (err) {
        setError(errorMessage(err));
        setDeleting(false);
      }
      return;
    }
    if (!confirm(`Delete “${product.name}” permanently? It has never sold.`)) return;
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
  const compareAt = parseFloat(form.compareAtPrice);
  const cost = parseFloat(form.costPrice);
  const margin = Number.isFinite(price) && price > 0 && Number.isFinite(cost) ? ((price - cost) / price) * 100 : null;
  const previewStock = product ? stock : parseInt(form.stock, 10);
  const categoryName =
    form.category === NEW_CATEGORY ? newCategory || 'New category' : (categories.find((c) => c.slug === form.category)?.name ?? form.category);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/products" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{product ? product.name : 'New product'}</h2>
          {product && <p className="text-sm text-muted-foreground">{formatNumber(product.sold)} sold to date</p>}
        </div>
      </div>

      <Stagger className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form id="product-form" onSubmit={save} className="flex min-w-0 flex-col gap-6">
          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>What customers see on the store.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input id="p-name" required maxLength={200} value={form.name} onChange={bind('name')} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea id="p-desc" rows={5} maxLength={5000} value={form.description} onChange={bind('description')} />
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Images</CardTitle>
                <CardDescription>The first image is the main one. Drag to reorder.</CardDescription>
              </CardHeader>
              <CardContent>
                <ImageGallery images={form.images} onChange={(images) => set('images', images)} />
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="p-price">Price</Label>
                  <Input id="p-price" required type="number" min="0" step="0.01" inputMode="decimal" placeholder="49.99" value={form.price} onChange={bind('price')} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-compare">Compare-at price</Label>
                  <Input id="p-compare" type="number" min="0" step="0.01" inputMode="decimal" placeholder="59.99" value={form.compareAtPrice} onChange={bind('compareAtPrice')} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-cost">Cost per item</Label>
                  <Input id="p-cost" type="number" min="0" step="0.01" inputMode="decimal" placeholder="20.00" value={form.costPrice} onChange={bind('costPrice')} />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  {Number.isFinite(compareAt) && Number.isFinite(price) && compareAt > price
                    ? `Shown as ${Math.round(((compareAt - price) / compareAt) * 100)}% off. `
                    : 'Compare-at shows a struck-through “was” price when it’s higher. '}
                  {margin !== null ? `Margin: ${margin.toFixed(1)}% (${formatPrice(Math.round((price - cost) * 100))} per item).` : 'Cost is private; it feeds margin reports.'}
                </p>
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Organisation</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="p-category">Category</Label>
                  <select id="p-category" className={cn(SELECT_CLASS, 'w-full')} value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {!categories.some((c) => c.slug === form.category) && form.category !== NEW_CATEGORY && (
                      <option value={form.category}>{form.category}</option>
                    )}
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ New category…</option>
                  </select>
                  {form.category === NEW_CATEGORY && (
                    <Input autoFocus placeholder="Category name" maxLength={60} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-sku">SKU</Label>
                  <Input id="p-sku" maxLength={64} placeholder="e.g. BAG-CNV-01" value={form.sku} onChange={bind('sku')} className="uppercase" />
                </div>
                {!product && (
                  <div className="grid gap-2">
                    <Label htmlFor="p-stock">Starting stock</Label>
                    <Input id="p-stock" type="number" min="0" step="1" inputMode="numeric" placeholder="25" value={form.stock} onChange={bind('stock')} />
                  </div>
                )}
                <div className="grid gap-2 sm:col-span-2">
                  <span className="text-sm font-medium">Visibility</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented
                      label="Visibility"
                      options={[
                        { id: 'active', label: 'Active' },
                        { id: 'draft', label: 'Draft' },
                        { id: 'archived', label: 'Archived' },
                      ]}
                      value={form.status}
                      onChange={(s) => set('status', s)}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-primary" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
                      <Star className="size-4 text-status-warning" /> Featured on the home page
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.status === 'active' ? 'Visible and for sale.' : form.status === 'draft' ? 'Hidden from the store while you work on it.' : 'Hidden, kept for order history.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          <FormError message={error} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            {product ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => void remove()} disabled={deleting}>
                {deleting ? <Loader2 className="animate-spin" /> : product.sold > 0 ? <Archive /> : <Trash2 />}
                {product.sold > 0 ? 'Archive product' : 'Delete product'}
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
        </form>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {/* Live preview of the storefront card */}
          <StaggerItem>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Preview</p>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="relative aspect-square bg-muted">
                <AnimatePresence mode="wait">
                  {mainImage && !imageBroken ? (
                    <motion.img
                      key={mainImage}
                      src={mainImage}
                      alt=""
                      onError={() => setImageBroken(true)}
                      className="size-full object-cover"
                      initial={{ opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                    />
                  ) : (
                    <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <ImageOff className="size-8" />
                      {imageBroken ? 'Image couldn’t be loaded' : 'No image yet'}
                    </motion.div>
                  )}
                </AnimatePresence>
                {form.status !== 'active' && (
                  <Badge variant="secondary" className="absolute top-2 left-2 capitalize">
                    {form.status}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-1.5 p-4">
                <span className="w-fit text-xs text-muted-foreground">{categoryName}</span>
                <p className="truncate font-medium">{form.name || 'Product name'}</p>
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{form.description || 'A short description helps customers decide.'}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">{Number.isFinite(price) ? formatPrice(Math.round(price * 100)) : '—'}</span>
                    {Number.isFinite(compareAt) && Number.isFinite(price) && compareAt > price && (
                      <span className="text-sm text-muted-foreground line-through">{formatPrice(Math.round(compareAt * 100))}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Number.isFinite(previewStock) ? (previewStock === 0 ? 'Out of stock' : `${previewStock} in stock`) : ''}
                  </span>
                </div>
              </div>
            </Card>
          </StaggerItem>

          {product && (
            <StaggerItem>
              <StockPanel productId={product._id} stock={stock} onStockChange={setStock} />
            </StaggerItem>
          )}
        </div>
      </Stagger>
    </div>
  );
}

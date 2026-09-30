'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, Download, Eye, EyeOff, Loader2, Package, Percent, Plus, Star, StarOff, Tag, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery, useDebounced } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormError from '@/components/admin/FormError';
import ImportProducts from '@/components/admin/ImportProducts';
import { useNotifications } from '@/components/admin/AdminNotifications';
import { useToast } from '@/components/admin/Toaster';
import { CountTabs, EmptyState, Pagination, SearchInput, SELECT_CLASS, StockMeter, Thumb } from '@/components/admin/kit';
import { EASE_OUT, rowMotion } from '@/components/admin/motion';
import type { ProductsListResponse } from '@/types/admin';
import type { CategoriesResponse, CategoryInfo } from '@/types';

const LIMIT = 20;
const TABS = [
  { id: 'all', label: 'All products' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
  { id: 'archived', label: 'Archived' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'stock_asc', label: 'Stock: lowest first' },
];

const STATUS_BADGE = {
  draft: <Badge variant="outline">Draft</Badge>,
  archived: <Badge variant="secondary">Archived</Badge>,
  active: null,
};

export default function ProductsPage() {
  return (
    <Suspense>
      <Products />
    </Suspense>
  );
}

function Products() {
  const router = useRouter();
  const toast = useToast();
  const { refresh: refreshNotifications } = useNotifications();
  const [url, setUrl] = useUrlState({ tab: 'all', q: '', category: '', status: '', sort: 'newest', page: '1' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const loadCategories = () =>
    adminApi<{ categories: { slug: string; name: string; image: string }[] }>('/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => api<CategoriesResponse>('/products/categories').then((r) => setCategories(r.items)).catch(() => undefined));
  useEffect(() => {
    void loadCategories();
  }, []);

  const tab = (TABS.some((t) => t.id === url.tab) ? url.tab : 'all') as Tab;
  const params = new URLSearchParams({ page: url.page, limit: String(LIMIT), sort: url.sort });
  if (tab === 'low' || tab === 'out') params.set('stock', tab);
  if (tab === 'archived') params.set('status', 'archived');
  else if (url.status) params.set('status', url.status);
  if (url.q) params.set('q', url.q);
  if (url.category) params.set('category', url.category);
  const query = params.toString();
  const { data, error, loading, refetch } = useAdminQuery<ProductsListResponse>(`/products?${query}`);

  // Selection belongs to the page of results it was made on.
  useEffect(() => setSelected(new Set()), [query]);

  const pageIds = data?.products.map((p) => p._id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function bulk(body: Record<string, unknown>, message: string) {
    setActionError('');
    try {
      const res = await adminApi<{ modified: number }>('/products/bulk', { method: 'POST', body: { ...body, ids: [...selected] } });
      toast(message, { description: `${res.modified} ${res.modified === 1 ? 'product' : 'products'} updated` });
      setSelected(new Set());
      refetch();
      refreshNotifications();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or SKU" className="w-full sm:w-64" />
          <select aria-label="Category" className={SELECT_CLASS} value={url.category} onChange={(e) => setUrl({ category: e.target.value, page: '1' })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          {tab !== 'archived' && (
            <select aria-label="Visibility" className={SELECT_CLASS} value={url.status} onChange={(e) => setUrl({ status: e.target.value, page: '1' })}>
              <option value="">Active & drafts</option>
              <option value="active">Active only</option>
              <option value="draft">Drafts only</option>
            </select>
          )}
          <select aria-label="Sort products" className={SELECT_CLASS} value={url.sort} onChange={(e) => setUrl({ sort: e.target.value, page: '1' })}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/admin/products/export" className={buttonVariants({ variant: 'outline' })} download>
            <Download />
            Export
          </a>
          <ImportProducts
            onImported={() => {
              toast('Products imported');
              refetch();
              void loadCategories();
            }}
          />
          <Link href="/admin/products/new" className={buttonVariants()}>
            <Plus />
            Add product
          </Link>
        </div>
      </div>

      <FormError message={error || actionError} />

      <Card className="relative gap-0 overflow-hidden py-0">
        <div className="px-4 pt-3">
          <CountTabs
            label="Products"
            options={TABS.map((t) => ({ ...t, count: data?.counts[t.id] }))}
            value={tab}
            onChange={(id) => setUrl({ tab: id, page: '1' })}
          />
        </div>

        <BulkBar count={selected.size} categories={categories} onClear={() => setSelected(new Set())} onAction={bulk} archivedTab={tab === 'archived'} />

        {!data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : data.products.length === 0 ? (
          <EmptyState
            icon={Package}
            title={url.q || url.category || tab !== 'all' || url.status ? 'No products match' : 'No products yet'}
            description={url.q || url.category || tab !== 'all' || url.status ? 'Try clearing the filters.' : 'Add your first product to start selling.'}
            action={
              <Link href="/admin/products/new" className={buttonVariants({ size: 'sm' })}>
                <Plus />
                Add product
              </Link>
            }
          />
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-50')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-6">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      className="size-4 accent-primary"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(pageIds))}
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="pr-6 text-right">Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={query}>
                {data.products.map((p, i) => (
                  <motion.tr
                    key={p._id}
                    {...rowMotion(i)}
                    onClick={() => router.push(`/admin/products/${p._id}`)}
                    className={cn('cursor-pointer border-b transition-colors hover:bg-muted/50', selected.has(p._id) && 'bg-muted/60')}
                  >
                    <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        className="size-4 accent-primary"
                        checked={selected.has(p._id)}
                        onChange={() => toggle(p._id)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Thumb src={p.image} alt={p.name} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <Link
                              href={`/admin/products/${p._id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="max-w-64 truncate font-medium hover:underline"
                            >
                              {p.name}
                            </Link>
                            {p.featured && <Star className="size-3.5 fill-status-warning text-status-warning" aria-label="Featured" />}
                            {STATUS_BADGE[p.status ?? 'active']}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {categories.find((c) => c.slug === p.category)?.name ?? p.category}
                            {p.sku && <> · {p.sku}</>}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="font-medium">{formatPrice(p.price)}</span>
                      {p.compareAtPrice && p.compareAtPrice > p.price && (
                        <span className="block text-xs text-muted-foreground line-through">{formatPrice(p.compareAtPrice)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StockMeter stock={p.stock} threshold={data.lowStockThreshold} />
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{formatNumber(p.sold)}</TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && (
          <Pagination page={data.page} pages={data.pages} total={data.total} limit={LIMIT} noun="products" onPage={(p) => setUrl({ page: String(p) })} />
        )}
      </Card>
    </div>
  );
}

function BulkBar({
  count,
  categories,
  onClear,
  onAction,
  archivedTab,
}: {
  count: number;
  categories: CategoryInfo[];
  onClear: () => void;
  onAction: (body: Record<string, unknown>, message: string) => Promise<void>;
  archivedTab: boolean;
}) {
  const [mode, setMode] = useState<'none' | 'category' | 'price'>('none');
  const [category, setCategory] = useState('');
  const [percent, setPercent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (count === 0) setMode('none');
  }, [count]);

  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    await onAction(body, message);
    setBusy(false);
    setMode('none');
  };

  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="overflow-hidden border-b bg-muted/50"
        >
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <span className="mr-1 font-medium tabular-nums">{count} selected</span>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {mode === 'none' && (
              <>
                {archivedTab ? (
                  <Button size="sm" variant="outline" onClick={() => void run({ action: 'activate' }, 'Products restored')}>
                    <Eye /> Restore
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void run({ action: 'activate' }, 'Products published')}>
                      <Eye /> Publish
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run({ action: 'draft' }, 'Products hidden')}>
                      <EyeOff /> Make draft
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run({ action: 'feature' }, 'Products featured')}>
                      <Star /> Feature
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run({ action: 'unfeature' }, 'Products unfeatured')}>
                      <StarOff /> Unfeature
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMode('category')}>
                      <Tag /> Category
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMode('price')}>
                      <Percent /> Adjust price
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Archive ${count} products? They’ll disappear from the store but keep their history.`)) {
                          void run({ action: 'archive' }, 'Products archived');
                        }
                      }}
                    >
                      <Archive /> Archive
                    </Button>
                  </>
                )}
              </>
            )}
            {mode === 'category' && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (category) void run({ action: 'category', category }, 'Category changed');
                }}
              >
                <select aria-label="New category" className={SELECT_CLASS} value={category} onChange={(e) => setCategory(e.target.value)} autoFocus>
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" type="submit" disabled={!category || busy}>
                  Apply
                </Button>
              </form>
            )}
            {mode === 'price' && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(percent);
                  if (!Number.isFinite(n) || n === 0) return;
                  if (confirm(`Change the price of ${count} products by ${n > 0 ? '+' : ''}${n}%?`)) void run({ action: 'price', percent: n }, 'Prices updated');
                }}
              >
                <Input
                  type="number"
                  step="0.5"
                  min="-90"
                  max="500"
                  placeholder="-10"
                  aria-label="Percentage change"
                  className="h-8 w-24"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  autoFocus
                />
                <span className="text-muted-foreground">% (negative lowers prices)</span>
                <Button size="sm" type="submit" disabled={!percent || busy}>
                  Apply
                </Button>
              </form>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={mode === 'none' ? onClear : () => setMode('none')}>
              <X /> {mode === 'none' ? 'Clear' : 'Back'}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

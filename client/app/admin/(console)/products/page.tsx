'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery, useDebounced } from '@/lib/use-admin-query';
import { useUrlState } from '@/lib/use-url-state';
import { formatNumber, formatPrice } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormError from '@/components/admin/FormError';
import { useNotifications } from '@/components/admin/AdminNotifications';
import { useToast } from '@/components/admin/Toaster';
import { CountTabs, EmptyState, Pagination, SearchInput, StockMeter, Thumb } from '@/components/admin/kit';
import { rowMotion } from '@/components/admin/motion';
import type { ProductsListResponse } from '@/types/admin';
import type { CategoriesResponse } from '@/types';

const LIMIT = 20;
const STOCK_TABS = [
  { id: 'all', label: 'All products' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
] as const;
const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'stock_asc', label: 'Stock: lowest first' },
];
const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

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
  const [url, setUrl] = useUrlState({ stock: 'all', q: '', category: '', sort: 'newest', page: '1' });
  const [search, setSearch] = useState(url.q);
  const debounced = useDebounced(search);
  const [categories, setCategories] = useState<string[]>([]);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (debounced !== url.q) setUrl({ q: debounced, page: '1' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    api<CategoriesResponse>('/products/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, []);

  const stock = (STOCK_TABS.some((t) => t.id === url.stock) ? url.stock : 'all') as (typeof STOCK_TABS)[number]['id'];
  const params = new URLSearchParams({ page: url.page, limit: String(LIMIT), sort: url.sort });
  if (stock !== 'all') params.set('stock', stock);
  if (url.q) params.set('q', url.q);
  if (url.category) params.set('category', url.category);
  const { data, error, loading, refetch } = useAdminQuery<ProductsListResponse>(`/products?${params}`);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete “${name}”? Past orders keep their copy of it.`)) return;
    setActionError('');
    try {
      await adminApi(`/products/${id}`, { method: 'DELETE' });
      toast('Product deleted', { description: name });
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
          <SearchInput value={search} onChange={setSearch} placeholder="Search products" className="w-full sm:w-64" />
          <select
            aria-label="Category"
            className={SELECT_CLASS}
            value={url.category}
            onChange={(e) => setUrl({ category: e.target.value, page: '1' })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort products"
            className={SELECT_CLASS}
            value={url.sort}
            onChange={(e) => setUrl({ sort: e.target.value, page: '1' })}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <Plus />
          Add product
        </Link>
      </div>

      <FormError message={error || actionError} />

      <Card className="gap-0 py-0">
        <div className="px-4 pt-3">
          <CountTabs
            label="Stock"
            options={STOCK_TABS.map((t) => ({ ...t, count: data?.counts[t.id] }))}
            value={stock}
            onChange={(id) => setUrl({ stock: id, page: '1' })}
          />
        </div>

        {!data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : data.products.length === 0 ? (
          <EmptyState
            icon={Package}
            title={url.q || url.category || stock !== 'all' ? 'No products match' : 'No products yet'}
            description={url.q || url.category || stock !== 'all' ? 'Try clearing the filters.' : 'Add your first product to start selling.'}
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
                  <TableHead className="pl-6">Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="w-24 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody key={`${url.page}-${stock}-${url.q}-${url.category}-${url.sort}`}>
                {data.products.map((p, i) => (
                  <motion.tr
                    key={p._id}
                    {...rowMotion(i)}
                    onClick={() => router.push(`/admin/products/${p._id}`)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-3">
                        <Thumb src={p.image} alt={p.name} />
                        <span className="min-w-0">
                          <Link
                            href={`/admin/products/${p._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-64 truncate font-medium hover:underline"
                          >
                            {p.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground capitalize">{p.category}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPrice(p.price)}</TableCell>
                    <TableCell>
                      <StockMeter stock={p.stock} threshold={data.lowStockThreshold} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.sold)}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/admin/products/${p._id}`}
                          className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => void remove(p._id, p.name)}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            limit={LIMIT}
            noun="products"
            onPage={(p) => setUrl({ page: String(p) })}
          />
        )}
      </Card>
    </div>
  );
}

import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { api, errorMessage, getStoreCurrency } from '@/lib/api';
import { getCategories } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import ProductCard from '@/components/ProductCard';
import SortSelect from '@/components/store/SortSelect';
import { RevealGroup, RevealItem } from '@/components/store/motion';
import type { CategoryInfo, ProductsResponse } from '@/types';

interface ShopParams {
  q?: string;
  category?: string;
  sort?: string;
  min?: string;
  max?: string;
  inStock?: string;
  page?: string;
}

const PAGE_SIZE = 12;
const SORTS = ['newest', 'price_asc', 'price_desc', 'name'];

export async function generateMetadata({ searchParams }: { searchParams: Promise<ShopParams> }): Promise<Metadata> {
  const { q, category } = await searchParams;
  const categories = category ? await getCategories() : [];
  const name = categories.find((c) => c.slug === category)?.name;
  return {
    title: q ? `Search: ${q}` : (name ?? 'Shop all'),
    description: name ? `Shop ${name.toLowerCase()}.` : 'Browse the full catalogue.',
  };
}

/** Builds a /shop link from the current filters plus changes ('' removes a filter). */
function shopHref(current: ShopParams, changes: Partial<ShopParams>): string {
  const next = { ...current, ...changes };
  if (!('page' in changes)) delete next.page; // any filter change goes back to page 1
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/shop?${qs}` : '/shop';
}

const dollarsToCents = (v?: string) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : '';
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<ShopParams> }) {
  const params = await searchParams;
  const { q = '', category = '', min = '', max = '', inStock = '', page = '1' } = params;
  const sort = SORTS.includes(params.sort ?? '') ? params.sort! : 'newest';

  const query = new URLSearchParams({ page, limit: String(PAGE_SIZE), sort });
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  if (dollarsToCents(min)) query.set('minPrice', dollarsToCents(min));
  if (dollarsToCents(max)) query.set('maxPrice', dollarsToCents(max));
  if (inStock) query.set('inStock', 'true');

  let data: ProductsResponse | null = null;
  let error = '';
  const [categories, result] = await Promise.all([
    getCategories(),
    api<ProductsResponse>(`/products?${query}`).catch((err: unknown) => {
      error = errorMessage(err);
      return null;
    }),
  ]);
  data = result;

  const activeCategory = categories.find((c) => c.slug === category);
  const heading = q ? `Results for “${q}”` : (activeCategory?.name ?? 'Shop all');
  const chips = [
    q && { label: `“${q}”`, href: shopHref(params, { q: '' }) },
    activeCategory && { label: activeCategory.name, href: shopHref(params, { category: '' }) },
    (min || max) && { label: `${min ? `from ${min}` : ''}${min && max ? ' ' : ''}${max ? `to ${max}` : ''} ${getStoreCurrency()}`, href: shopHref(params, { min: '', max: '' }) },
    inStock && { label: 'In stock', href: shopHref(params, { inStock: '' }) },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>{' '}
          / <span className="text-foreground">Shop</span>
        </nav>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{heading}</h1>
        {activeCategory?.description && <p className="max-w-2xl text-muted-foreground">{activeCategory.description}</p>}
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* Filters: a sidebar on desktop, a collapsible panel on small screens. Plain forms and
            links, so they work before (or without) JavaScript. */}
        <aside className="hidden lg:block" aria-label="Filters">
          <Filters params={params} categories={categories} />
        </aside>
        <details className="group rounded-2xl border p-4 lg:hidden [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between font-medium">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4" /> Filters
            </span>
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          </summary>
          <Filters params={params} categories={categories} />
        </details>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {data ? `${data.total} ${data.total === 1 ? 'product' : 'products'}` : ''}
              </p>
              {chips.map((c) => (
                <Link key={c.label} href={c.href} className="flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1.5 pl-3 text-sm hover:bg-muted" aria-label={`Remove filter ${c.label}`}>
                  {c.label} <X className="size-3.5" />
                </Link>
              ))}
              {chips.length > 1 && (
                <Link href="/shop" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Clear all
                </Link>
              )}
            </div>
            <Suspense>
              <SortSelect value={sort} />
            </Suspense>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn’t load products</AlertTitle>
              <AlertDescription>{error}. Please try again in a moment.</AlertDescription>
            </Alert>
          ) : data && data.products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-20 text-center">
              <SearchX className="size-10 text-muted-foreground" />
              <p className="font-medium">Nothing matches those filters</p>
              <p className="text-sm text-muted-foreground">Try a different search or remove a filter.</p>
              <Link href="/shop" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-2 rounded-full' })}>
                Clear filters
              </Link>
            </div>
          ) : (
            data && (
              <RevealGroup key={query.toString()} className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
                {data.products.map((p, i) => (
                  <RevealItem key={p._id}>
                    <ProductCard product={p} priority={i < 3} />
                  </RevealItem>
                ))}
              </RevealGroup>
            )
          )}

          {data && data.pages > 1 && <Pager params={params} page={data.page} pages={data.pages} />}
        </div>
      </div>
    </div>
  );
}

function Filters({ params, categories }: { params: ShopParams; categories: CategoryInfo[] }) {
  const active = params.category ?? '';
  return (
    <div className="mt-4 flex flex-col gap-8 lg:sticky lg:top-24 lg:mt-0">
      <div className="flex flex-col gap-1">
        <p className="mb-2 text-sm font-semibold">Category</p>
        <Link href={shopHref(params, { category: '' })} className={cn('rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted', !active && 'bg-muted font-medium')}>
          All products
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={shopHref(params, { category: c.slug })}
            className={cn('flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted', active === c.slug && 'bg-muted font-medium')}
            aria-current={active === c.slug ? 'page' : undefined}
          >
            {c.name}
            {c.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>}
          </Link>
        ))}
      </div>

      <form action="/shop" className="flex flex-col gap-3">
        {/* Keep the other filters when applying price/stock. */}
        {params.q && <input type="hidden" name="q" value={params.q} />}
        {params.category && <input type="hidden" name="category" value={params.category} />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        <p className="text-sm font-semibold">Price ({getStoreCurrency()})</p>
        <div className="flex items-center gap-2">
          <input name="min" type="number" min="0" step="1" inputMode="decimal" placeholder="Min" defaultValue={params.min} aria-label="Minimum price" className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
          <span className="text-muted-foreground">–</span>
          <input name="max" type="number" min="0" step="1" inputMode="decimal" placeholder="Max" defaultValue={params.max} aria-label="Maximum price" className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inStock" value="1" defaultChecked={!!params.inStock} className="size-4 accent-foreground" />
          In stock only
        </label>
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}>
          Apply
        </button>
      </form>
    </div>
  );
}

function Pager({ params, page, pages }: { params: ShopParams; page: number; pages: number }) {
  const numbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 pt-4">
      <Link aria-disabled={page <= 1} href={shopHref(params, { page: String(page - 1) })} className={buttonVariants({ variant: 'ghost', size: 'sm', className: cn(page <= 1 && 'pointer-events-none opacity-40') })}>
        <ChevronLeft /> Prev
      </Link>
      {numbers.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && n - numbers[i - 1]! > 1 && <span className="px-1 text-muted-foreground">…</span>}
          <Link
            href={shopHref(params, { page: String(n) })}
            aria-current={n === page ? 'page' : undefined}
            className={buttonVariants({ variant: n === page ? 'default' : 'ghost', size: 'icon-sm', className: 'rounded-full tabular-nums' })}
          >
            {n}
          </Link>
        </span>
      ))}
      <Link aria-disabled={page >= pages} href={shopHref(params, { page: String(page + 1) })} className={buttonVariants({ variant: 'ghost', size: 'sm', className: cn(page >= pages && 'pointer-events-none opacity-40') })}>
        Next <ChevronRight />
      </Link>
    </nav>
  );
}

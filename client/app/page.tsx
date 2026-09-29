import Link from 'next/link';
import { AlertCircle, Search } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ProductCard from '@/components/ProductCard';
import type { CategoriesResponse, ProductsResponse } from '@/types';

interface HomeSearchParams {
  q?: string;
  category?: string;
  page?: string;
}

// Native <select> so the filter form still submits without JavaScript.
// Styled to match the shadcn select trigger.
const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 sm:w-48';

export default async function Home({ searchParams }: { searchParams: Promise<HomeSearchParams> }) {
  const { q = '', category = '', page = '1' } = await searchParams;

  const query = new URLSearchParams({ page });
  if (q) query.set('q', q);
  if (category) query.set('category', category);

  let data: ProductsResponse;
  let categories: string[];
  try {
    const [products, cats] = await Promise.all([
      api<ProductsResponse>(`/products?${query}`),
      api<CategoriesResponse>('/products/categories'),
    ]);
    data = products;
    categories = cats.categories;
  } catch (err) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Could not load products</AlertTitle>
        <AlertDescription>{errorMessage(err)} — is the API running on port 5000?</AlertDescription>
      </Alert>
    );
  }

  const pageLink = (n: number): string => {
    const params = new URLSearchParams({ page: String(n) });
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    return `/?${params}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">All products</h1>
        <p className="text-sm text-muted-foreground">
          {data.total} {data.total === 1 ? 'item' : 'items'}
          {category && ` in ${category}`}
          {q && ` matching “${q}”`}
        </p>
      </div>

      <form action="/" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search products…"
            className="h-9 pl-8"
          />
        </div>
        <select name="category" defaultValue={category} className={SELECT_CLASS}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" size="lg">
          Search
        </Button>
      </form>

      {data.products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No products match your search.</p>
          <Link href="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-4">
          {data.page > 1 ? (
            <Link
              href={pageLink(data.page - 1)}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Previous
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {data.page} of {data.pages}
          </span>
          {data.page < data.pages ? (
            <Link
              href={pageLink(data.page + 1)}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Next
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

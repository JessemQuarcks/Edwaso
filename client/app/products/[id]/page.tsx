import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { api, ApiError, formatPrice } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AddToCartButton from '@/components/AddToCartButton';
import { PLACEHOLDER_IMAGE } from '@/components/ProductCard';
import type { Product, ProductResponse } from '@/types';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product: Product;
  try {
    ({ product } = await api<ProductResponse>(`/products/${id}`));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }

  const inStock = product.stock > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-fit -ml-2' })}
      >
        <ChevronLeft />
        Back to products
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image || PLACEHOLDER_IMAGE}
          alt={product.name}
          className="aspect-square w-full rounded-xl border bg-muted object-cover"
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit capitalize">
              {product.category}
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
            <p className="text-3xl font-semibold tabular-nums">{formatPrice(product.price)}</p>
          </div>

          <Separator />

          {product.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          <p className="text-sm">
            {inStock ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                In stock — {product.stock} available
              </span>
            ) : (
              <span className="text-muted-foreground">Currently out of stock</span>
            )}
          </p>

          <AddToCartButton product={product} size="lg" className="w-full sm:w-fit" />
        </div>
      </div>
    </div>
  );
}

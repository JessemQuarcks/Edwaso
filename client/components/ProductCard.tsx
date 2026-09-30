import Link from 'next/link';
import { formatPrice } from '@/lib/api';
import { cn } from '@/lib/utils';
import AddToCartButton from './AddToCartButton';
import ProductImage from './store/ProductImage';
import type { Product } from '@/types';

/** Units at or below which the card shows "Only N left". */
export const LOW_STOCK = 5;

const SIZES = '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw';

export default function ProductCard({ product, priority = false, className }: { product: Product; priority?: boolean; className?: string }) {
  const onSale = !!product.compareAtPrice && product.compareAtPrice > product.price;
  const second = product.images?.[1];
  const soldOut = product.stock < 1;

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1',
        className
      )}
    >
      <Link
        href={`/products/${product._id}`}
        className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-foreground/5"
      >
        <ProductImage
          src={product.image}
          alt={product.name}
          sizes={SIZES}
          priority={priority}
          className={cn('transition-all duration-700 ease-out motion-safe:group-hover:scale-105', second && 'group-hover:opacity-0')}
        />
        {second && (
          <ProductImage
            src={second}
            alt=""
            sizes={SIZES}
            className="opacity-0 transition-all duration-700 ease-out group-hover:opacity-100 motion-safe:group-hover:scale-105"
          />
        )}

        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {onSale && (
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-foreground">
              −{Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)}%
            </span>
          )}
          {!soldOut && product.stock <= LOW_STOCK && (
            <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium backdrop-blur">Only {product.stock} left</span>
          )}
        </div>
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-background px-3 py-1 text-sm font-medium shadow-sm">Sold out</span>
          </div>
        )}
      </Link>

      <div className="flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <Link href={`/products/${product._id}`} className="line-clamp-1 font-medium underline-offset-4 hover:underline">
            {product.name}
          </Link>
          <p className="mt-0.5 flex items-baseline gap-1.5 text-sm">
            <span className="font-semibold tabular-nums">{formatPrice(product.price)}</span>
            {onSale && <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(product.compareAtPrice!)}</span>}
          </p>
        </div>
        <AddToCartButton product={product} size="icon" className="shrink-0 rounded-full" compact />
      </div>
    </article>
  );
}

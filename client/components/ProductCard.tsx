import Link from 'next/link';
import { formatPrice } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import AddToCartButton from './AddToCartButton';
import type { Product } from '@/types';

export const PLACEHOLDER_IMAGE = 'https://picsum.photos/seed/placeholder/600/600';

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="group flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link href={`/products/${product._id}`} className="relative block overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image || PLACEHOLDER_IMAGE}
          alt={product.name}
          className="aspect-square w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.stock < 1 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="secondary">Out of stock</Badge>
          </div>
        )}
      </Link>

      <CardContent className="flex flex-1 flex-col gap-1 px-4 pt-4">
        <Link
          href={`/products/${product._id}`}
          className="font-medium leading-snug hover:underline"
        >
          {product.name}
        </Link>
        <span className="text-xs capitalize text-muted-foreground">{product.category}</span>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 px-4 pb-4">
        <span className="font-semibold tabular-nums">{formatPrice(product.price)}</span>
        <AddToCartButton product={product} size="sm" />
      </CardFooter>
    </Card>
  );
}

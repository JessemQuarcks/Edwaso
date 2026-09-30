import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe2, Lock, PackageSearch } from 'lucide-react';
import { api, ApiError, formatPrice } from '@/lib/api';
import { getCategories, getStoreInfo } from '@/lib/store';
import ProductGallery from '@/components/ProductGallery';
import ProductPurchase from '@/components/store/ProductPurchase';
import { ProductGrid } from '@/components/store/landing/Sections';
import { Reveal } from '@/components/store/motion';
import type { Product, ProductResponse, ProductsResponse } from '@/types';

// One request per render, shared by generateMetadata and the page.
const getProduct = cache(async (id: string): Promise<Product | null> => {
  try {
    return (await api<ProductResponse>(`/products/${id}`, { next: { revalidate: 60 } })).product;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: 'Product not found' };
  const description = product.description.slice(0, 160) || `Buy ${product.name}.`;
  const images = (product.images?.length ? product.images : [product.image]).filter((src) => src.startsWith('https://'));
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product._id}` },
    openGraph: { title: product.name, description, type: 'website', images: images.slice(0, 4) },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title: product.name, description, images: images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [store, categories, related] = await Promise.all([
    getStoreInfo(),
    getCategories(),
    api<ProductsResponse>(`/products?category=${encodeURIComponent(product.category)}&exclude=${product._id}&limit=4`, { next: { revalidate: 60 } })
      .then((r) => r.products)
      .catch(() => []),
  ]);
  const category = categories.find((c) => c.slug === product.category);
  const images = product.images?.length ? product.images : product.image ? [product.image] : [];
  const onSale = !!product.compareAtPrice && product.compareAtPrice > product.price;
  const countries = store.shippingCountries.length;

  // Structured data for search results (price, availability).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: images,
    sku: product.sku,
    category: category?.name,
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: store.currency.toUpperCase(),
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden>/</span>
          <Link href="/shop" className="hover:text-foreground">
            Shop
          </Link>
          {category && (
            <>
              <span aria-hidden>/</span>
              <Link href={`/shop?category=${category.slug}`} className="hover:text-foreground">
                {category.name}
              </Link>
            </>
          )}
          <span aria-hidden>/</span>
          <span className="truncate text-foreground" aria-current="page">
            {product.name}
          </span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Reveal y={16}>
            <ProductGallery images={images} name={product.name} />
          </Reveal>

          <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            <Reveal delay={0.05} className="flex flex-col gap-3">
              {category && (
                <Link href={`/shop?category=${category.slug}`} className="w-fit text-sm font-medium text-brand hover:underline">
                  {category.name}
                </Link>
              )}
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{product.name}</h1>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums">{formatPrice(product.price)}</span>
                {onSale && (
                  <>
                    <span className="text-lg text-muted-foreground line-through tabular-nums">{formatPrice(product.compareAtPrice!)}</span>
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-sm font-semibold text-brand-foreground">
                      Save {formatPrice(product.compareAtPrice! - product.price)}
                    </span>
                  </>
                )}
              </div>
            </Reveal>

            {product.description && (
              <Reveal delay={0.1}>
                <p className="leading-relaxed text-pretty whitespace-pre-line text-muted-foreground">{product.description}</p>
              </Reveal>
            )}

            <Reveal delay={0.15}>
              <ProductPurchase product={product} />
            </Reveal>

            <Reveal delay={0.2}>
              <ul className="grid gap-3 rounded-2xl border bg-muted/30 p-4 text-sm">
                <li className="flex items-center gap-3">
                  <Lock className="size-4 text-brand" /> Secure checkout, payments handled by Stripe
                </li>
                {countries > 0 && (
                  <li className="flex items-center gap-3">
                    <Globe2 className="size-4 text-brand" /> Ships to {countries} {countries === 1 ? 'country' : 'countries'}; options shown at checkout
                  </li>
                )}
                <li className="flex items-center gap-3">
                  <PackageSearch className="size-4 text-brand" /> Track your order from your account
                </li>
              </ul>
            </Reveal>

            {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
          </div>
        </div>
      </div>

      <ProductGrid products={related} eyebrow="You might also like" title={category ? `More ${category.name.toLowerCase()}` : 'More to explore'} href={`/shop?category=${product.category}`} />

      {/* JSON-LD: product data is escaped by JSON.stringify; "<" is escaped so it can't close the tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}

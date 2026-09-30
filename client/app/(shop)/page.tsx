import { api } from '@/lib/api';
import { getCategories, getStoreInfo } from '@/lib/store';
import Hero from '@/components/store/landing/Hero';
import ProductRail from '@/components/store/landing/ProductRail';
import { CategoryTiles, NewsletterBand, ProductGrid, Promo, Testimonials, TrustBar } from '@/components/store/landing/Sections';
import type { ProductsResponse } from '@/types';

// Rebuilt at most once a minute; product and content edits show up within that.
export const revalidate = 60;

async function products(query: string) {
  try {
    return (await api<ProductsResponse>(`/products?${query}`, { next: { revalidate: 60 } })).products;
  } catch {
    return []; // The page still renders its static sections if the API is briefly down.
  }
}

export default async function Home() {
  const [store, categories, featured, newest] = await Promise.all([
    getStoreInfo(),
    getCategories(),
    products('featured=true&limit=10'),
    products('sort=newest&limit=8'),
  ]);
  const { storefront } = store;

  // The hero collage prefers featured products with photos, topped up from the newest.
  const collage = [...featured, ...newest.filter((p) => !featured.some((f) => f._id === p._id))].filter((p) => p.image).slice(0, 3);
  const countries = store.shippingCountries.length;
  const trustLine = ['Secure checkout by Stripe', countries ? `Ships to ${countries} ${countries === 1 ? 'country' : 'countries'}` : '', 'Easy order tracking']
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Hero eyebrow={storefront.heroEyebrow} title={storefront.heroTitle} subtitle={storefront.heroSubtitle} products={collage} trustLine={trustLine} />
      <TrustBar shippingCountries={countries} supportEmail={store.supportEmail} />
      <CategoryTiles categories={categories} />
      {featured.length > 0 ? (
        <ProductRail products={featured} eyebrow="Featured" title="Our favourites right now" href="/shop" />
      ) : null}
      <Promo promo={storefront.promo} fallbackImage={collage[0]?.image} />
      <ProductGrid products={newest} eyebrow="Just in" title="New arrivals" href="/shop?sort=newest" />
      <Testimonials items={storefront.testimonials} />
      <NewsletterBand storeName={store.storeName} />
    </>
  );
}

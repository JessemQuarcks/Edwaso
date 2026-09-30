import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { getCategories } from '@/lib/store';
import { SITE_URL } from '@/lib/site';
import type { ProductsResponse } from '@/types';

export const revalidate = 3600;

/** Home, shop, each category and every product on sale (up to 50 pages of 50). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/shop`, changeFrequency: 'daily', priority: 0.9 },
  ];
  for (const c of await getCategories()) {
    entries.push({ url: `${SITE_URL}/shop?category=${encodeURIComponent(c.slug)}`, changeFrequency: 'weekly', priority: 0.7 });
  }
  try {
    for (let page = 1, pages = 1; page <= pages && page <= 50; page++) {
      const res = await api<ProductsResponse>(`/products?limit=50&page=${page}`, { next: { revalidate: 3600 } });
      pages = res.pages;
      for (const p of res.products) {
        entries.push({ url: `${SITE_URL}/products/${p._id}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.8 });
      }
    }
  } catch {
    // Serve what we have if the API is unavailable.
  }
  return entries;
}

import { API_URL } from './api';
import type { CategoriesResponse, CategoryInfo, StoreInfo, StorefrontContent } from '@/types';

export const DEFAULT_STOREFRONT: StorefrontContent = {
  announcement: '',
  heroEyebrow: 'New season',
  heroTitle: 'Everyday goods, made to last.',
  heroSubtitle: 'Thoughtfully designed essentials for the way you live.',
  promo: { title: '', body: '', ctaLabel: '', ctaHref: '', image: '' },
  testimonials: [],
  social: { instagram: '', facebook: '', x: '', tiktok: '' },
};

const FALLBACK: StoreInfo = { storeName: 'Shop', currency: 'usd', supportEmail: '', storefront: DEFAULT_STOREFRONT, shippingCountries: [] };

// Server components only. Cached for a minute, so edits in the admin show up within a minute;
// if the API is down the storefront still renders with defaults.

export async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const res = await fetch(`${API_URL}/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as Partial<StoreInfo>;
    return { ...FALLBACK, ...data, storefront: { ...DEFAULT_STOREFRONT, ...data.storefront } };
  } catch {
    return FALLBACK;
  }
}

export async function getCategories(): Promise<CategoryInfo[]> {
  try {
    const res = await fetch(`${API_URL}/products/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return ((await res.json()) as CategoriesResponse).items;
  } catch {
    return [];
  }
}

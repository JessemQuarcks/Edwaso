import { API_URL } from './api';
import type { StoreInfo } from '@/types';

const FALLBACK: StoreInfo = { storeName: 'Shop', currency: 'usd', supportEmail: '' };

/** Public store settings for server components. Cached for a minute; falls back if the API is down. */
export async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const res = await fetch(`${API_URL}/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return FALLBACK;
    return (await res.json()) as StoreInfo;
  } catch {
    return FALLBACK;
  }
}

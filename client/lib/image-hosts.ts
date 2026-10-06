// Hosts next/image may optimise. Images from anywhere else (an admin can paste any https URL)
// fall back to a plain <img> in <ProductImage>. Kept dependency-free: next.config.ts imports it.

const apiOrigin = (): URL | null => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api');
  } catch {
    return null;
  }
};

/** hostnames, e.g. "cdn.example.com". Extra ones come from NEXT_PUBLIC_IMAGE_HOSTS (comma-separated). */
export function imageHosts(): string[] {
  const extra = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const api = apiOrigin();
  return [...new Set(['picsum.photos', 'fastly.picsum.photos', 'res.cloudinary.com',...(api ? [api.hostname] : []), ...extra])];
}

export function isOptimizable(src: string): boolean {
  try {
    const url = new URL(src);
    // The API serves uploads itself with long-lived caching; local/private hosts can't go
    // through the optimiser, so they render as-is.
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return false;
    return imageHosts().includes(url.hostname);
  } catch {
    return false;
  }
}

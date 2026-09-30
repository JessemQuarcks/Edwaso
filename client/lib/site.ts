/** The storefront's public origin, for canonical URLs, the sitemap and share images. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

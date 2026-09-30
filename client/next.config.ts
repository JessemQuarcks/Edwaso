import type { NextConfig } from 'next';
import { imageHosts } from './lib/image-hosts';

// Server-side only: where the Express API listens.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5000';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts().map((hostname) => ({ protocol: 'https' as const, hostname })),
    formats: ['image/avif', 'image/webp'],
  },
  // The admin console talks to the API through this same-origin proxy, so its session cookie
  // is first-party (httpOnly, SameSite=Strict) and is also visible to middleware.ts on /admin.
  async rewrites() {
    return [{ source: '/api/admin/:path*', destination: `${API_ORIGIN}/api/admin/:path*` }];
  },
};

export default nextConfig;

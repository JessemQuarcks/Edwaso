import type { NextConfig } from 'next';

// Server-side only: where the Express API listens.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5000';

const nextConfig: NextConfig = {
  // The admin console talks to the API through this same-origin proxy, so its session cookie
  // is first-party (httpOnly, SameSite=Strict) and is also visible to middleware.ts on /admin.
  async rewrites() {
    return [{ source: '/api/admin/:path*', destination: `${API_ORIGIN}/api/admin/:path*` }];
  },
};

export default nextConfig;

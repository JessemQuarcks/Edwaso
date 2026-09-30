import type { ReactNode } from 'react';

// Standard storefront pages (sign-in, cart, account…) share a centred, padded container.
// The landing page, shop and product pages lay themselves out edge to edge.
export default function PageLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>;
}

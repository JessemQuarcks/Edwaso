import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

// The admin console has no storefront header or cart. See (auth) and (console) for the
// signed-out and signed-in shells.
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-muted/40">{children}</div>;
}

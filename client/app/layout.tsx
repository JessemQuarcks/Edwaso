import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { getStoreInfo } from '@/lib/store';
import { setStoreCurrency } from '@/lib/api';
import Providers from '@/components/Providers';
import { THEME_SCRIPT } from '@/components/ThemeToggle';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = await getStoreInfo();
  return { title: { default: storeName, template: `%s · ${storeName}` }, description: `Shop online at ${storeName}` };
}

// Shared by the storefront, app/(shop), and the admin console, app/admin. Each has its own layout.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await getStoreInfo();
  setStoreCurrency(store.currency);
  return (
    // The theme script sets the `dark` class before hydration.
    <html lang="en" className={cn('font-sans antialiased', geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <Providers store={store}>{children}</Providers>
      </body>
    </html>
  );
}

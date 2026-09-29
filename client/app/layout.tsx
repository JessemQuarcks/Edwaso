import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import Providers from '@/components/Providers';
import { THEME_SCRIPT } from '@/components/ThemeToggle';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Shop',
  description: 'E-commerce store built with Next.js, Express, MongoDB and Stripe',
};

// Shared by the storefront, app/(shop), and the admin console, app/admin. Each has its own layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the `dark` class before hydration.
    <html lang="en" className={cn('font-sans antialiased', geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

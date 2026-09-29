import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import Providers from '@/components/Providers';
import Header from '@/components/Header';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Shop',
  description: 'E-commerce store built with Next.js, Express, MongoDB and Stripe',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans antialiased', geist.variable)}>
      <body className="min-h-svh bg-background text-foreground">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

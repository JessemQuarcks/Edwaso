import type { ReactNode } from 'react';
import Header from '@/components/Header';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">{children}</main>
    </>
  );
}

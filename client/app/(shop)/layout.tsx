import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/store/Footer';
import { StoreMotion } from '@/components/store/motion';
import { getCategories, getStoreInfo } from '@/lib/store';

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [store, categories] = await Promise.all([getStoreInfo(), getCategories()]);
  return (
    <StoreMotion>
      <div className="flex min-h-svh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <Header categories={categories} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer store={store} categories={categories} />
      </div>
    </StoreMotion>
  );
}

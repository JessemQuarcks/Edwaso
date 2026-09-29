import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <ShieldCheck className="size-4" />
          Shop Admin
        </span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">{children}</main>
    </div>
  );
}

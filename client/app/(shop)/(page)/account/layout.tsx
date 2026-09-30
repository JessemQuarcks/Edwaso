import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import AccountShell from '@/components/store/AccountShell';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}

import type { ReactNode } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { requireAdminMe } from '@/lib/admin-server';

// Validates the session with the API before anything renders, so no console markup
// is ever sent to someone without a complete admin session.
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAdminMe();
  return <AdminShell user={user}>{children}</AdminShell>;
}

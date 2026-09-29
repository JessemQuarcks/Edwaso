import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import { getAdminMe } from '@/lib/admin-server';

export const metadata: Metadata = { title: 'Sign in' };

export default async function AdminLoginPage() {
  // Already signed in: skip the form.
  const me = await getAdminMe();
  if (me) redirect(me.pendingSteps.length > 0 ? '/admin/setup' : '/admin');

  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}

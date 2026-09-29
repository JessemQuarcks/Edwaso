import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SetupWizard from '@/components/admin/SetupWizard';
import { getAdminMe } from '@/lib/admin-server';

export const metadata: Metadata = { title: 'Finish setup' };

// A restricted session lands here until the password is changed (when required) and 2FA is on.
export default async function AdminSetupPage() {
  const me = await getAdminMe();
  if (!me) redirect('/admin/login');
  if (me.pendingSteps.length === 0) redirect('/admin');
  return <SetupWizard user={me.user} initialSteps={me.pendingSteps} />;
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, LogOut } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import PasswordForm from './PasswordForm';
import RecoveryCodes from './RecoveryCodes';
import TwoFactorEnroll from './TwoFactorEnroll';
import type { AdminUser, PendingStep } from '@/types/admin';

const STEP_LABEL: Record<PendingStep, string> = {
  change_password: 'Choose a new password',
  enroll_2fa: 'Set up two-factor authentication',
};

export default function SetupWizard({ user, initialSteps }: { user: AdminUser; initialSteps: PendingStep[] }) {
  const router = useRouter();
  // Every step this visit started with, to draw the progress list.
  const [allSteps] = useState(initialSteps);
  const [pending, setPending] = useState(initialSteps);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const current = pending[0];

  function enterConsole() {
    router.replace('/admin');
    router.refresh();
  }

  async function signOut() {
    await adminApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">
          {recoveryCodes ? 'Save your recovery codes' : `Welcome, ${user.name.split(' ')[0]}`}
        </CardTitle>
        <CardDescription>
          {recoveryCodes
            ? 'If you lose your phone, each of these codes signs you in once. Store them somewhere safe, like a password manager. They won’t be shown again.'
            : 'Finish securing your account before using the admin console.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {!recoveryCodes && allSteps.length > 1 && (
          <ol className="flex flex-col gap-2 text-sm">
            {allSteps.map((step, i) => {
              const done = !pending.includes(step);
              return (
                <li key={step} className={cn('flex items-center gap-2', step === current ? 'font-medium' : 'text-muted-foreground')}>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border text-xs',
                      done && 'border-transparent bg-primary text-primary-foreground'
                    )}
                  >
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  {STEP_LABEL[step]}
                </li>
              );
            })}
          </ol>
        )}

        {recoveryCodes ? (
          <RecoveryCodes codes={recoveryCodes} />
        ) : current === 'change_password' ? (
          <PasswordForm submitLabel="Save password" onChanged={(r) => setPending(r.pendingSteps)} />
        ) : current === 'enroll_2fa' ? (
          <TwoFactorEnroll
            onEnabled={(r) => {
              setPending(r.pendingSteps);
              setRecoveryCodes(r.recoveryCodes);
            }}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-emerald-600" />
            Your account is ready.
          </p>
        )}
      </CardContent>

      <CardFooter className="mt-6 justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut />
          Sign out
        </Button>
        {(recoveryCodes || pending.length === 0) && (
          <Button onClick={enterConsole}>
            {recoveryCodes ? 'I’ve saved them, continue' : 'Continue to the console'}
            <ArrowRight />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

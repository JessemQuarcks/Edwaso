'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, KeyRound, Loader2, Smartphone } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi, safeAdminRedirect } from '@/lib/admin-api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormError from './FormError';
import type { AdminLoginResponse } from '@/types/admin';

type Step = { kind: 'password' } | { kind: '2fa'; challenge: string };

export default function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function finish(result: Extract<AdminLoginResponse, { status: 'ok' }>) {
    const destination = result.pendingSteps.length > 0 ? '/admin/setup' : safeAdminRedirect(params.get('next'));
    router.replace(destination);
    router.refresh();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (step.kind === 'password') {
        const result = await adminApi<AdminLoginResponse>('/auth/login', {
          method: 'POST',
          body: { email, password },
        });
        if (result.status === '2fa_required') {
          setStep({ kind: '2fa', challenge: result.challenge });
          setPassword('');
          setLoading(false);
          return;
        }
        finish(result);
      } else {
        const result = await adminApi<AdminLoginResponse>('/auth/login/2fa', {
          method: 'POST',
          body: { challenge: step.challenge, code },
        });
        if (result.status === 'ok') finish(result);
      }
    } catch (err) {
      setError(errorMessage(err));
      // An expired challenge can't be retried; start over.
      if (step.kind === '2fa' && /start again/i.test(errorMessage(err))) {
        setStep({ kind: 'password' });
        setCode('');
      }
      setLoading(false);
    }
  }

  const is2fa = step.kind === '2fa';

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{is2fa ? 'Two-factor authentication' : 'Sign in to the admin console'}</CardTitle>
        <CardDescription>
          {is2fa
            ? useRecovery
              ? 'Enter one of your recovery codes. Each code works once.'
              : 'Enter the 6-digit code from your authenticator app.'
            : 'For staff accounts only. Your shopping account won’t work here.'}
        </CardDescription>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          {params.get('expired') && !is2fa && !error && (
            <Alert>
              <Clock />
              <AlertDescription>Your session ended. Sign in again to continue.</AlertDescription>
            </Alert>
          )}

          {is2fa ? (
            <div className="grid gap-2">
              <Label htmlFor="code">{useRecovery ? 'Recovery code' : 'Authentication code'}</Label>
              <Input
                id="code"
                key={useRecovery ? 'recovery' : 'totp'}
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode={useRecovery ? 'text' : 'numeric'}
                pattern={useRecovery ? undefined : '[0-9]{6}'}
                maxLength={useRecovery ? 11 : 6}
                placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          <FormError message={error} />
        </CardContent>

        <CardFooter className="mt-6 flex-col gap-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {is2fa ? 'Verify' : 'Continue'}
          </Button>
          {is2fa && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode('');
                setError('');
              }}
            >
              {useRecovery ? <Smartphone /> : <KeyRound />}
              {useRecovery ? 'Use authenticator app instead' : 'Use a recovery code instead'}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

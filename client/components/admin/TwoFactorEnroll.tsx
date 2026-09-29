'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import FormError from './FormError';
import type { TwoFactorEnableResponse, TwoFactorSetupResponse } from '@/types/admin';

/** Scan-the-QR-code enrolment. Calls `onEnabled` with the one-time recovery codes. */
export default function TwoFactorEnroll({ onEnabled }: { onEnabled: (result: TwoFactorEnableResponse) => void }) {
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Each setup call issues a new secret, so it must run exactly once (strict mode runs effects twice).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    adminApi<TwoFactorSetupResponse>('/auth/2fa/setup', { method: 'POST' })
      .then(setSetup)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      onEnabled(await adminApi<TwoFactorEnableResponse>('/auth/2fa/enable', { method: 'POST', body: { code } }));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  // Groups of four are easier to type into an authenticator app.
  const manualKey = setup?.secret.match(/.{1,4}/g)?.join(' ');

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>Open an authenticator app (1Password, Google Authenticator, Authy, …).</li>
        <li>Scan the QR code, or enter the setup key by hand.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {setup ? (
          // Data URL from the API; next/image adds nothing here.
          <img
            src={setup.qrCode}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="rounded-lg border bg-white p-2"
          />
        ) : (
          <Skeleton className="size-44 rounded-lg" />
        )}
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Setup key</span>
          {manualKey ? (
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all">{manualKey}</code>
          ) : (
            <Skeleton className="h-6 w-48" />
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="totp-code">6-digit code</Label>
        <Input
          id="totp-code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          className="max-w-40 font-mono tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </div>

      <FormError message={error} />
      <Button type="submit" disabled={loading || !setup} className="self-start">
        {loading && <Loader2 className="animate-spin" />}
        Turn on two-factor
      </Button>
    </form>
  );
}

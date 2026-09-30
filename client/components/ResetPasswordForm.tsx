'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { api, errorMessage, setToken } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthResponse } from '@/types';

export default function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('The passwords don’t match');
    setLoading(true);
    try {
      const res = await api<AuthResponse>('/auth/reset', { method: 'POST', body: { token, password } });
      setToken(res.token);
      // A full load so the session provider picks up the new sign-in.
      window.location.assign('/');
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">This link is incomplete</CardTitle>
          <CardDescription>Open the link from your email again, or request a new one.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/forgot-password" className="text-sm underline underline-offset-4">
            Request a new link
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>You’ll be signed out everywhere else.</CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          {/* Lets password managers pair the new password with the account. */}
          <input type="text" autoComplete="username" hidden readOnly />
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                {error}{' '}
                {/expired|invalid/i.test(error) && (
                  <Link href="/forgot-password" className="underline underline-offset-4">
                    Request a new link
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Save and log in
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

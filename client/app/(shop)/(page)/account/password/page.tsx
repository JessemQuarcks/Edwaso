'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/Providers';
import { Reveal } from '@/components/store/motion';
import type { AuthResponse } from '@/types';

export default function AccountPasswordPage() {
  const { user, setSession } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next !== confirm) return setError('The new passwords don’t match');
    setBusy(true);
    try {
      const res = await api<AuthResponse>('/auth/password', { method: 'POST', auth: true, body: { currentPassword: current, newPassword: next } });
      // The old session is revoked everywhere; keep this device signed in with the new one.
      setSession(res.user, res.token);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Reveal>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You’ll stay signed in here and be signed out on other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid max-w-md gap-4">
            <input type="text" autoComplete="username" value={user?.email ?? ''} hidden readOnly />
            <div className="grid gap-2">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {done && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="size-4" /> Password changed.
              </p>
            )}
            <Button type="submit" className="w-fit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </Reveal>
  );
}

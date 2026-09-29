'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormError from './FormError';
import type { AdminAccountResponse } from '@/types/admin';

export const ADMIN_MIN_PASSWORD = 12;

/** Changes the admin's password. The API signs out every other session when it succeeds. */
export default function PasswordForm({
  submitLabel = 'Change password',
  onChanged,
}: {
  submitLabel?: string;
  onChanged: (result: AdminAccountResponse) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (next !== confirm) return setError('The new passwords don’t match');
    setLoading(true);
    try {
      const result = await adminApi<AdminAccountResponse>('/auth/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Lets password managers pair the new password with the account. */}
      <input type="text" autoComplete="username" hidden readOnly />
      <div className="grid gap-2">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={ADMIN_MIN_PASSWORD}
          maxLength={72}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          At least {ADMIN_MIN_PASSWORD} characters. A few unrelated words make a strong, memorable password.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={loading} className="self-start">
        {loading && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

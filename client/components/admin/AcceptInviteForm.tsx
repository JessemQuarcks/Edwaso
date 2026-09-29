'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormError from './FormError';
import { ADMIN_MIN_PASSWORD } from './PasswordForm';
import type { InviteInfo } from '@/types/admin';

export default function AcceptInviteForm({ token, invite }: { token: string; invite: InviteInfo }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('The passwords don’t match');
    setLoading(true);
    try {
      await adminApi(`/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: { name, password },
      });
      // A new account always has 2FA to set up next.
      router.replace('/admin/setup');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Join the admin team</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          You’ve been invited as <Badge variant="secondary" className="capitalize">{invite.role}</Badge>
        </CardDescription>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoComplete="username" value={invite.email} readOnly disabled />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Your name</Label>
            <Input
              id="invite-name"
              autoComplete="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-password">Password</Label>
            <Input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={ADMIN_MIN_PASSWORD}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least {ADMIN_MIN_PASSWORD} characters.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-confirm">Confirm password</Label>
            <Input
              id="invite-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <FormError message={error} />
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Create account
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You’ll set up two-factor authentication next.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

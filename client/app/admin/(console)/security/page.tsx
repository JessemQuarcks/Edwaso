'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Laptop, LogOut, ShieldCheck } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdmin } from '@/components/admin/AdminShell';
import FormError from '@/components/admin/FormError';
import PasswordForm from '@/components/admin/PasswordForm';
import EmailAlerts from '@/components/admin/EmailAlerts';
import type { AdminSessionInfo } from '@/types/admin';

/** "Chrome on Windows"-style label from a user agent string. Good enough for recognising a device. */
function describeDevice(ua = ''): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Unknown browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS';
  return `${browser} on ${os}`;
}

export default function SecurityPage() {
  const admin = useAdmin();
  const [sessions, setSessions] = useState<AdminSessionInfo[]>([]);
  const [error, setError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions((await adminApi<{ sessions: AdminSessionInfo[] }>('/sessions')).sessions);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    try {
      await adminApi(`/sessions/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function revokeOthers() {
    try {
      await adminApi('/sessions', { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Signed in as {admin.email} · <span className="capitalize">{admin.role}</span>
      </p>

      <FormError message={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs you out on every other device.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {passwordChanged && (
              <Alert>
                <Check />
                <AlertDescription>Password changed. Other sessions were signed out.</AlertDescription>
              </Alert>
            )}
            <PasswordForm
              onChanged={() => {
                setPasswordChanged(true);
                void load();
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>Required for every admin account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" />
              On, using an authenticator app.
            </p>
            <p className="text-muted-foreground">
              Lost your device and your recovery codes? An owner can reset two-factor from the server with{' '}
              <code className="text-xs">npm run admin -- reset-2fa --email …</code>
            </p>
          </CardContent>
        </Card>
      </div>

      <EmailAlerts />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Where you’re signed in</CardTitle>
            <CardDescription>
              Sessions end after 30 minutes of inactivity, or 8 hours at most.
            </CardDescription>
          </div>
          {others > 0 && (
            <Button variant="outline" size="sm" onClick={() => void revokeOthers()}>
              <LogOut />
              Sign out {others} other {others === 1 ? 'session' : 'sessions'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Laptop className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {describeDevice(s.userAgent)}
                      {s.current && <Badge variant="secondary">This device</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.ip ?? 'Unknown IP'} · signed in {new Date(s.createdAt).toLocaleString()} · last active{' '}
                      {new Date(s.lastSeenAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={() => void revoke(s.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

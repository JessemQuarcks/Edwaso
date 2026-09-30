'use client';

import { useState } from 'react';
import { CircleAlert, CircleCheck, Loader2, Send } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import FormError from './FormError';
import { useToast } from './Toaster';

const SENT = ['Order confirmation', 'Shipped, with tracking', 'Refund and cancellation', 'Password reset', 'Team invites', 'Staff alerts'];

/** Whether the email provider is configured, what gets sent, and a test button. */
export default function EmailStatusCard({ email, canTest }: { email: { configured: boolean; from: string }; canTest: boolean }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function test() {
    setError('');
    setSending(true);
    try {
      const res = await adminApi<{ status: 'sent' | 'logged' | 'failed'; to: string; error?: string }>('/settings/test-email', { method: 'POST' });
      if (res.status === 'failed') setError(`The provider refused it: ${res.error ?? 'unknown error'}`);
      else if (res.status === 'logged') toast('Printed to the server log', { description: 'Email isn’t set up, so nothing was sent.' });
      else toast('Test email sent', { description: `Check ${res.to}` });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Email</CardTitle>
          <CardDescription>Sent automatically, with replies going to your support email.</CardDescription>
        </div>
        {email.configured ? (
          <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-3" /> Connected
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-amber-700 dark:text-amber-400">
            <CircleAlert className="size-3" /> Not set up
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {email.configured ? (
          <p>
            Sending as <span className="font-medium">{email.from}</span> through Resend.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Emails are only written to the API’s log. To send them, set <code className="text-xs">RESEND_API_KEY</code> and{' '}
            <code className="text-xs">EMAIL_FROM</code> (an address on a domain verified in Resend) on the server and restart it.
          </p>
        )}
        <ul className="flex flex-wrap gap-1.5">
          {SENT.map((s) => (
            <li key={s} className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {s}
            </li>
          ))}
        </ul>
        <FormError message={error} />
        {canTest && (
          <Button type="button" variant="outline" className="self-start" disabled={sending} onClick={() => void test()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send me a test email
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

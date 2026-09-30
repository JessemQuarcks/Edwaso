'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { AlertCircle, Loader2, MailCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we’ll send you a link to choose a new one.</CardDescription>
      </CardHeader>
      {sent ? (
        <CardContent>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="size-10 text-emerald-600" />
            <p className="text-sm">
              If <span className="font-medium">{email}</span> has an account, a reset link is on its way. It expires in an hour.
            </p>
            <Link href="/login" className="text-sm underline underline-offset-4">
              Back to log in
            </Link>
          </motion.div>
        </CardContent>
      ) : (
        <form onSubmit={submit}>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
            <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Remembered it? Log in
            </Link>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

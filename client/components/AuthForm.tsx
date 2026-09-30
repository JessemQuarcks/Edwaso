'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from './Providers';

interface FormState {
  name: string;
  email: string;
  password: string;
}

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);

      // Only allow same-site relative redirects.
      const next = params.get('next');
      router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isRegister ? 'Create account' : 'Welcome back'}</CardTitle>
        <CardDescription>
          {isRegister
            ? 'Enter your details to start shopping.'
            : 'Log in to continue to your cart and orders.'}
        </CardDescription>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          {isRegister && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={form.name} onChange={set('name')} />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!isRegister && (
                <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
              value={form.password}
              onChange={set('password')}
            />
            {isRegister && (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
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
            {loading ? 'Please wait' : isRegister ? 'Create account' : 'Log in'}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <Link href="/login" className="text-foreground underline underline-offset-4">
                  Log in
                </Link>
              </>
            ) : (
              <>
                No account?{' '}
                <Link href="/register" className="text-foreground underline underline-offset-4">
                  Register
                </Link>
              </>
            )}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

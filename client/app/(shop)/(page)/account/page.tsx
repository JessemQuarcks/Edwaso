'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/Providers';
import { Reveal } from '@/components/store/motion';
import type { MeResponse } from '@/types';

export default function AccountPage() {
  const { user, setSession } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api<MeResponse>('/auth/me', { method: 'PATCH', auth: true, body: { name } });
      setSession(res.user);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How we address you on orders and emails.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid max-w-md gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} readOnly disabled />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving || name === user?.name}>
                  {saving && <Loader2 className="animate-spin" />}
                  Save
                </Button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" /> Saved
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </Reveal>

    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import FormError from './FormError';
import { useToast } from './Toaster';
import type { NotificationPreferencesResponse, NotifyTopic } from '@/types/admin';

const TOPICS: Record<NotifyTopic, { label: string; hint: string }> = {
  orders: { label: 'New orders', hint: 'An email for every paid order. Handy for small shops; noisy for busy ones.' },
  stock: { label: 'Low and out of stock', hint: 'When a product drops to your low-stock level, and when it sells out.' },
  payments: { label: 'Payment problems', hint: 'When a Stripe event can’t be processed, so orders don’t get stuck.' },
};

/** Each person's choice of which console notifications also arrive by email. */
export default function EmailAlerts() {
  const toast = useToast();
  const [data, setData] = useState<NotificationPreferencesResponse | null>(null);
  const [saving, setSaving] = useState<NotifyTopic | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<NotificationPreferencesResponse>('/notifications/preferences')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  async function toggle(topic: NotifyTopic, on: boolean) {
    if (!data) return;
    setError('');
    setSaving(topic);
    setData({ ...data, preferences: { ...data.preferences, [topic]: on } }); // optimistic
    try {
      setData(await adminApi<NotificationPreferencesResponse>('/notifications/preferences', { method: 'PUT', body: { [topic]: on } }));
      toast(on ? `You’ll get ${TOPICS[topic].label.toLowerCase()} emails` : `${TOPICS[topic].label} emails turned off`);
    } catch (err) {
      setData(data);
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card id="email-alerts" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Email alerts</CardTitle>
        <CardDescription>
          Everything shows up under the bell in the console. Choose what should also be emailed{data ? ` to ${data.email}` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <FormError message={error} />
        {!data && !error && <Skeleton className="h-32 rounded-lg" />}
        {data?.topics.map((topic) => (
          <label key={topic} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={data.preferences[topic]}
              disabled={saving !== null}
              onChange={(e) => void toggle(topic, e.target.checked)}
            />
            <span className="flex-1 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {TOPICS[topic].label}
                {saving === topic && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </span>
              <span className="block text-xs text-muted-foreground">{TOPICS[topic].hint}</span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

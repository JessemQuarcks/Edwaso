'use client';

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Lock, Save, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import FormError from '@/components/admin/FormError';
import { useAdmin } from '@/components/admin/AdminShell';
import { useToast } from '@/components/admin/Toaster';
import { SELECT_CLASS } from '@/components/admin/kit';
import { Stagger, StaggerItem } from '@/components/admin/motion';
import StorefrontSettings from '@/components/admin/StorefrontSettings';
import type { SettingsResponse, StoreSettings } from '@/types/admin';

const CURRENCIES = ['usd', 'eur', 'gbp', 'cad', 'aud', 'nzd', 'chf', 'sek', 'nok', 'dkk', 'ghs', 'ngn', 'kes', 'zar'];
const SUGGESTED_COUNTRIES = ['US', 'CA', 'GB', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT', 'AU', 'NZ', 'GH', 'NG', 'KE', 'ZA'];

const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};
const currencyName = (code: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};

export default function SettingsPage() {
  const admin = useAdmin();
  const toast = useToast();
  const { data, error, setData } = useAdminQuery<SettingsResponse>('/settings');
  const [form, setForm] = useState<StoreSettings | null>(null);
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const canEdit = admin.role !== 'staff';

  useEffect(() => {
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  if (!form || !data) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
        <FormError message={error} />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);

  function addCountry(code: string) {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return setSaveError('Use a two-letter country code, like GB');
    if (!form!.shippingCountries.includes(c)) set('shippingCountries', [...form!.shippingCountries, c]);
    setCountry('');
    setSaveError('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const { settings } = await adminApi<{ settings: StoreSettings }>('/settings', { method: 'PATCH', body: form });
      setData({ ...data!, settings });
      setForm(settings);
      toast('Settings saved');
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4" /> Only owners and admins can change settings.
        </p>
      )}
      <fieldset disabled={!canEdit} className="contents">
        <Stagger className="grid gap-6 lg:grid-cols-2">
          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Store</CardTitle>
                <CardDescription>Shown on the storefront, invoices and emails.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="s-name">Store name</Label>
                  <Input id="s-name" required maxLength={80} value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-email">Support email</Label>
                  <Input id="s-email" type="email" placeholder="help@yourstore.com" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-currency">Currency</Label>
                  <select
                    id="s-currency"
                    className={cn(SELECT_CLASS, 'w-full')}
                    value={form.currency}
                    disabled={data.currencyLocked}
                    onChange={(e) => set('currency', e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()} · {currencyName(c)}
                      </option>
                    ))}
                  </select>
                  {data.currencyLocked && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="size-3" /> Locked: the store has orders, and every price and order is stored in this currency.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Checkout</CardTitle>
                <CardDescription>Passed to Stripe Checkout for every order.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="s-country">Ships to</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence initial={false}>
                      {form.shippingCountries.map((c) => (
                        <motion.span
                          key={c}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-1 pl-2.5 text-sm"
                        >
                          {countryName(c)}
                          <button
                            type="button"
                            onClick={() => set('shippingCountries', form.shippingCountries.filter((x) => x !== c))}
                            disabled={form.shippingCountries.length === 1}
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                            aria-label={`Stop shipping to ${countryName(c)}`}
                          >
                            <X className="size-3" />
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="s-country"
                      placeholder="Country code, e.g. DE"
                      maxLength={2}
                      className="w-48 uppercase"
                      list="country-suggestions"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCountry(country);
                        }
                      }}
                    />
                    <datalist id="country-suggestions">
                      {SUGGESTED_COUNTRIES.filter((c) => !form.shippingCountries.includes(c)).map((c) => (
                        <option key={c} value={c}>
                          {countryName(c)}
                        </option>
                      ))}
                    </datalist>
                    <Button type="button" variant="outline" onClick={() => addCountry(country)} disabled={!country}>
                      Add
                    </Button>
                  </div>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={form.automaticTax} onChange={(e) => set('automaticTax', e.target.checked)} />
                  <span>
                    Calculate tax automatically
                    <span className="block text-xs text-muted-foreground">
                      Uses Stripe Tax. Turn this on only after setting up Stripe Tax and your tax registrations in the Stripe dashboard, or checkout will fail.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Label htmlFor="s-low">Low-stock alert at</Label>
                <div className="flex items-center gap-2">
                  <Input id="s-low" type="number" min="0" max="10000" step="1" className="w-24" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', parseInt(e.target.value || '0', 10))} />
                  <span className="text-sm text-muted-foreground">units or fewer</span>
                </div>
                <p className="text-xs text-muted-foreground">Products at or below this appear in notifications and the low-stock filter.</p>
              </CardContent>
            </Card>
          </StaggerItem>

          <StorefrontSettings value={form.storefront} onChange={(v) => set('storefront', v)} />
        </Stagger>
      </fieldset>

      {canEdit && (
        <AnimatePresence>
          {dirty && (
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="sticky bottom-4 z-20 mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border bg-popover p-3 shadow-lg"
            >
              <span className="text-sm">You have unsaved changes.</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(data.settings)}>
                  Discard
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Save
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      <FormError message={saveError} />
    </form>
  );
}

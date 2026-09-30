'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageGallery from './ImageGallery';
import { StaggerItem } from './motion';
import type { StorefrontContent } from '@/types';

const SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)', tiktok: 'TikTok' } as const;

/** Home-page content. Empty sections are hidden on the store. */
export default function StorefrontSettings({ value, onChange }: { value: StorefrontContent; onChange: (v: StorefrontContent) => void }) {
  const set = <K extends keyof StorefrontContent>(key: K, v: StorefrontContent[K]) => onChange({ ...value, [key]: v });
  const setPromo = (key: keyof StorefrontContent['promo'], v: string) => set('promo', { ...value.promo, [key]: v });
  const setSocial = (key: keyof StorefrontContent['social'], v: string) => set('social', { ...value.social, [key]: v });
  const setTestimonial = (i: number, patch: Partial<StorefrontContent['testimonials'][number]>) =>
    set('testimonials', value.testimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <>
      <StaggerItem className="lg:col-span-2">
        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            <h2 className="text-lg font-semibold">Storefront</h2>
            <p className="text-sm text-muted-foreground">The home page. Changes appear on the store within a minute of saving.</p>
          </div>
          <Link href="/" target="_blank" className="flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
            View home page <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Hero & announcement</CardTitle>
            <CardDescription>The first thing visitors see.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field id="sf-announcement" label="Announcement bar" hint="A one-line banner above the header, e.g. a promotion. Leave empty to hide it.">
              <Input id="sf-announcement" maxLength={160} value={value.announcement} onChange={(e) => set('announcement', e.target.value)} />
            </Field>
            <Field id="sf-eyebrow" label="Eyebrow">
              <Input id="sf-eyebrow" maxLength={40} placeholder="New season" value={value.heroEyebrow} onChange={(e) => set('heroEyebrow', e.target.value)} />
            </Field>
            <Field id="sf-title" label="Headline">
              <Input id="sf-title" required maxLength={120} value={value.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} />
            </Field>
            <Field id="sf-subtitle" label="Supporting line" hint="Also used as the store description in search results and the footer.">
              <Textarea id="sf-subtitle" rows={2} maxLength={300} value={value.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} />
            </Field>
            <p className="text-xs text-muted-foreground">The hero pictures come from your featured products (mark them with the star on the product page).</p>
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Promo section</CardTitle>
            <CardDescription>An image with a short story and a button. Hidden without a title.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field id="sf-promo-title" label="Title">
              <Input id="sf-promo-title" maxLength={120} placeholder="The travel edit" value={value.promo.title} onChange={(e) => setPromo('title', e.target.value)} />
            </Field>
            <Field id="sf-promo-body" label="Text">
              <Textarea id="sf-promo-body" rows={3} maxLength={600} value={value.promo.body} onChange={(e) => setPromo('body', e.target.value)} />
            </Field>
            <div className="grid gap-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sf-promo-cta" label="Button label">
                  <Input id="sf-promo-cta" maxLength={40} placeholder="Shop bags" value={value.promo.ctaLabel} onChange={(e) => setPromo('ctaLabel', e.target.value)} />
                </Field>
                <Field id="sf-promo-href" label="Button link">
                  <Input id="sf-promo-href" maxLength={500} placeholder="/shop" value={value.promo.ctaHref} onChange={(e) => setPromo('ctaHref', e.target.value)} />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">Link to a page on this store, like /shop?category=bags, or a full https:// address.</p>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Image</span>
              <ImageGallery max={1} images={value.promo.image ? [value.promo.image] : []} onChange={(imgs) => setPromo('image', imgs[0] ?? '')} />
              <p className="text-xs text-muted-foreground">Without one, a featured product’s photo is used.</p>
            </div>
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Testimonials</CardTitle>
            <CardDescription>Real quotes from customers, with their permission. The section is hidden while this is empty.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {value.testimonials.map((t, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2 rounded-xl border p-3"
                >
                  <Textarea rows={2} maxLength={400} placeholder="What they said" aria-label={`Quote ${i + 1}`} value={t.quote} onChange={(e) => setTestimonial(i, { quote: e.target.value })} />
                  <div className="flex gap-2">
                    <Input maxLength={80} placeholder="Name" aria-label={`Name ${i + 1}`} value={t.author} onChange={(e) => setTestimonial(i, { author: e.target.value })} />
                    <Input maxLength={80} placeholder="Where / detail (optional)" aria-label={`Detail ${i + 1}`} value={t.detail} onChange={(e) => setTestimonial(i, { detail: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => set('testimonials', value.testimonials.filter((_, j) => j !== i))} aria-label={`Remove testimonial ${i + 1}`}>
                      <Trash2 />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {value.testimonials.length < 6 && (
              <Button type="button" variant="outline" className="self-start" onClick={() => set('testimonials', [...value.testimonials, { quote: '', author: '', detail: '' }])}>
                <Plus /> Add testimonial
              </Button>
            )}
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card>
          <CardHeader>
            <CardTitle>Social links</CardTitle>
            <CardDescription>Shown in the footer. Full https:// links; empty ones are hidden.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(SOCIAL_LABELS) as (keyof typeof SOCIAL_LABELS)[]).map((key) => (
              <Field key={key} id={`sf-${key}`} label={SOCIAL_LABELS[key]}>
                <Input id={`sf-${key}`} type="url" placeholder="https://…" value={value.social[key]} onChange={(e) => setSocial(key, e.target.value)} />
              </Field>
            ))}
          </CardContent>
        </Card>
      </StaggerItem>
    </>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

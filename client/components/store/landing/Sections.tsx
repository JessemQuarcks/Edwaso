import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Globe2, Headphones, Lock, PackageSearch, Quote } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ProductCard from '../../ProductCard';
import NewsletterForm from '../NewsletterForm';
import ProductImage from '../ProductImage';
import { Reveal, RevealGroup, RevealItem } from '../motion';
import type { CategoryInfo, Product, StorefrontContent } from '@/types';

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {eyebrow && <p className="text-sm font-medium text-brand">{eyebrow}</p>}
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      </div>
      {action}
    </Reveal>
  );
}

// ---- Trust bar: only claims the store can back up.

export function TrustBar({ shippingCountries, supportEmail }: { shippingCountries: number; supportEmail: string }) {
  const items = [
    { icon: Lock, title: 'Secure checkout', text: 'Payments handled by Stripe' },
    ...(shippingCountries > 0
      ? [{ icon: Globe2, title: `Ships to ${shippingCountries} ${shippingCountries === 1 ? 'country' : 'countries'}`, text: 'Delivery options at checkout' }]
      : []),
    { icon: PackageSearch, title: 'Track every order', text: 'Live status in your account' },
    { icon: Headphones, title: 'Real support', text: supportEmail || 'We’re here to help' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <RevealGroup className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <RevealItem key={title} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{text}</span>
            </span>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---- Shop by category: bento grid, first tile large.

export function CategoryTiles({ categories }: { categories: CategoryInfo[] }) {
  if (categories.length === 0) return null;
  const tiles = categories.slice(0, 5);
  return (
    <section id="categories" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6">
      <SectionHeader
        eyebrow="Shop by category"
        title="Find what you’re after"
        action={
          <Link href="/shop" className="group flex items-center gap-1 text-sm font-medium">
            All products <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        }
      />
      <RevealGroup className="grid auto-rows-[200px] grid-cols-2 gap-4 md:auto-rows-[240px] lg:grid-cols-4">
        {tiles.map((c, i) => (
          <RevealItem key={c.slug} className={cn(i === 0 && tiles.length > 2 && 'col-span-2 row-span-2')}>
            <Link href={`/shop?category=${c.slug}`} className="group relative block size-full overflow-hidden rounded-3xl bg-muted">
              <ProductImage
                src={c.image}
                alt=""
                sizes={i === 0 ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'}
                className="transition-transform duration-700 ease-out motion-safe:group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent transition-opacity duration-500 group-hover:from-black/80" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-white">
                <div>
                  <p className={cn('font-semibold tracking-tight', i === 0 && tiles.length > 2 ? 'text-3xl' : 'text-xl')}>{c.name}</p>
                  {c.count !== undefined && <p className="text-sm text-white/80">{c.count} {c.count === 1 ? 'product' : 'products'}</p>}
                </div>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform duration-300 group-hover:-rotate-45 motion-safe:group-hover:scale-110">
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---- Product grids

export function ProductGrid({ products, eyebrow, title, href }: { products: Product[]; eyebrow: string; title: string; href: string }) {
  if (products.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        action={
          <Link href={href} className={buttonVariants({ variant: 'outline', className: 'group rounded-full' })}>
            View all <ArrowRight className="transition-transform group-hover:translate-x-1" />
          </Link>
        }
      />
      <RevealGroup className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <RevealItem key={p._id}>
            <ProductCard product={p} />
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---- Editorial split (only when the admin has written one)

export function Promo({ promo, fallbackImage }: { promo: StorefrontContent['promo']; fallbackImage?: string }) {
  if (!promo.title) return null;
  const image = promo.image || fallbackImage;
  const external = promo.ctaHref.startsWith('https://');
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="grid items-center gap-10 overflow-hidden rounded-[2rem] border bg-card p-4 sm:p-6 lg:grid-cols-2 lg:gap-16">
        <Reveal y={40} className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
          <ProductImage src={image} alt="" sizes="(min-width: 1024px) 45vw, 90vw" className="transition-transform duration-[1.5s] hover:scale-105" />
        </Reveal>
        <div className="flex flex-col items-start gap-5 px-2 pb-6 lg:pb-0">
          <Reveal delay={0.1}>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{promo.title}</h2>
          </Reveal>
          {promo.body && (
            <Reveal delay={0.2}>
              <p className="max-w-lg text-lg text-pretty whitespace-pre-line text-muted-foreground">{promo.body}</p>
            </Reveal>
          )}
          {promo.ctaLabel && promo.ctaHref && (
            <Reveal delay={0.3}>
              {external ? (
                <a href={promo.ctaHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'lg', className: 'group rounded-full' })}>
                  {promo.ctaLabel} <ArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              ) : (
                <Link href={promo.ctaHref} className={buttonVariants({ size: 'lg', className: 'group rounded-full' })}>
                  {promo.ctaLabel} <ArrowRight className="transition-transform group-hover:translate-x-1" />
                </Link>
              )}
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Testimonials (only real ones, entered in the admin)

export function Testimonials({ items }: { items: StorefrontContent['testimonials'] }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeader eyebrow="Kind words" title="What customers say" />
      <RevealGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <RevealItem key={i}>
            <figure className="flex h-full flex-col gap-5 rounded-3xl border bg-card p-6 transition-shadow hover:shadow-lg">
              <Quote className="size-7 text-brand" />
              <blockquote className="flex-1 text-lg text-pretty">“{t.quote}”</blockquote>
              <figcaption className="text-sm">
                <span className="font-semibold">{t.author}</span>
                {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
              </figcaption>
            </figure>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---- Newsletter band

export function NewsletterBand({ storeName }: { storeName: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <Reveal className="relative isolate overflow-hidden rounded-[2rem] bg-foreground px-6 py-14 text-background sm:px-12">
        <div aria-hidden className="animate-drift absolute -top-24 -right-24 -z-10 size-96 rounded-full bg-brand/40 blur-3xl" />
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Be first to know</h2>
            <p className="max-w-md text-background/70">New arrivals, restocks and the occasional offer from {storeName}. Unsubscribe any time.</p>
          </div>
          <NewsletterForm tone="inverted" />
        </div>
      </Reveal>
    </section>
  );
}

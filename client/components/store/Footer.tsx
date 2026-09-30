import Link from 'next/link';
import { Lock, Mail, ShoppingBag } from 'lucide-react';
import NewsletterForm from './NewsletterForm';
import type { CategoryInfo, StoreInfo } from '@/types';

// Simple brand marks (lucide dropped brand icons).
const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v6h4v-6h3l1-4h-4V8Z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L2 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M16.5 3a5 5 0 0 0 4 4.4v3.3a8.2 8.2 0 0 1-4-1.3v6.3A6.3 6.3 0 1 1 10.2 9.4v3.4a3 3 0 1 0 2.1 2.9V3h4.2Z" />
    </svg>
  ),
};

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', x: 'X', tiktok: 'TikTok' };

export default function Footer({ store, categories }: { store: StoreInfo; categories: CategoryInfo[] }) {
  const socials = Object.entries(store.storefront.social).filter(([, url]) => url);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t bg-muted/30 print:hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
              <ShoppingBag className="size-4" />
            </span>
            {store.storeName}
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{store.storefront.heroSubtitle}</p>
          {socials.length > 0 && (
            <div className="flex gap-2">
              {socials.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${store.storeName} on ${SOCIAL_LABEL[key]}`}
                  className="flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground"
                >
                  {SOCIAL_ICONS[key]}
                </a>
              ))}
            </div>
          )}
        </div>

        <FooterColumn title="Shop">
          <FooterLink href="/shop">All products</FooterLink>
          <FooterLink href="/shop?sort=newest">New arrivals</FooterLink>
          {categories.slice(0, 5).map((c) => (
            <FooterLink key={c.slug} href={`/shop?category=${c.slug}`}>
              {c.name}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Account">
          <FooterLink href="/account">My account</FooterLink>
          <FooterLink href="/account/orders">Orders & tracking</FooterLink>
          <FooterLink href="/cart">Cart</FooterLink>
          <FooterLink href="/forgot-password">Reset password</FooterLink>
        </FooterColumn>

        <FooterColumn title="Stay in touch">
          <p className="text-sm text-muted-foreground">New arrivals and the odd offer. No spam.</p>
          <NewsletterForm />
          {store.supportEmail && (
            <a href={`mailto:${store.supportEmail}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Mail className="size-4" /> {store.supportEmail}
            </a>
          )}
        </FooterColumn>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            © {year} {store.storeName}. All rights reserved.
          </p>
          <p className="flex items-center gap-1.5">
            <Lock className="size-3.5" /> Payments processed securely by Stripe
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground">
      {children}
    </Link>
  );
}

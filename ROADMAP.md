# Roadmap

Where the app is today, and what it takes to get to a polished storefront plus a real admin back office.

## Where things stand

| Area | Today | Gap |
| --- | --- | --- |
| Landing (`client/app/page.tsx`) | Heading, search bar and a product grid | No hero, no featured or category sections, no motion. The catalogue *is* the landing page. *(Fixed in Phase 3.)* |
| Auth | One login for everyone. The JWT sits in `localStorage` for 7 days, and admin is a boolean `isAdmin` on `User`. | An admin is just a customer with a flag. The admin session is the shopping session, it can't be revoked, and any XSS can read the token. |
| Admin gating | `/admin` is a client component that hides itself when `!user.isAdmin`. The API checks `adminOnly`. | The page shell still ships to every visitor, and nothing is enforced at the route level. The seed also creates `admin@example.com / admin12345`. |
| Admin UI (`client/app/admin/page.tsx`) | A single page with a product form, a product table and an orders table capped at 200 | No layout or navigation, no user management, no finances, no pagination, search, order detail, refunds or audit trail. |
| Orders | `pending → paid → shipped / cancelled` | Cancelling a paid order doesn't refund or restock. An admin can mark a pending order as `paid` by hand. The Stripe payment intent isn't stored, so refunds are impossible. |
| Quality | Typecheck only | No git repo, no tests and no request validation library |

---

## Phase 0: Foundations (≈1–2 days) · ✅ done except shared types

Do this before touching features so every later phase is safer.

- [x] `git init` and make a first commit. `.gitignore` already excludes `.env`.
- [x] Add **zod** to the server for request validation. Replace the hand-rolled `typeof` checks in `auth.ts`, `products.ts` and `checkout.ts`.
- [x] Add a test harness: **vitest + supertest + mongodb-memory-server** on the server, then smoke-test the auth, checkout and webhook flows.
- [ ] Share types. Move the API response types into a `shared/` package, or generate them from the zod schemas, so `client/types/index.ts` stops drifting. *Deferred: needs a workspace setup; admin types are hand-kept in `client/types/admin.ts` for now.*
- [x] Wire up the dark-mode toggle. The tokens already exist in `globals.css`, and the admin panel will benefit.

---

## Phase 1: Admin authentication done right (≈3–4 days) · ✅ done

Goal: an admin session is a separate thing from a customer session. Logging in on the storefront never grants admin access, even for an account that has the admin role.

### Data model
- [x] Replace `isAdmin: boolean` with `role: 'customer' | 'staff' | 'admin' | 'owner'`, and add a migration script for existing users.
- [x] Add `status: 'active' | 'disabled'`, `lastLoginAt`, `passwordChangedAt`, and `tokenVersion` (increment it to revoke every session).
- [x] Add a new `AdminSession` collection with `userId`, a hashed session id, `ip`, `userAgent`, `createdAt`, `lastSeenAt` and `expiresAt`, plus a TTL index.
- [x] Add a new `AuditLog` collection with `actorId`, `action`, `entity`, `entityId`, a `before`/`after` diff, `ip` and `at`.

### Server
- [x] Mount a separate router at `/api/admin/*`. All admin endpoints move here, off `/api/products` and `/api/orders`.
- [x] Add `POST /api/admin/auth/login` with its own stricter rate limit (for example 5 attempts per 15 min per IP+email) and account lockout after repeated failures.
- [x] Use a **server-side session in an httpOnly, `Secure`, `SameSite=Strict` cookie** (`admin_sid`), scoped to `Path=/api/admin`. Give it a short idle timeout (about 30 min) and an absolute cap (about 8 h). Don't use a JWT in localStorage here. *Built with `Path=/` (so `middleware.ts` can see it on `/admin` pages), served first-party through a Next.js rewrite of `/api/admin/*`, and named `__Host-admin_sid` in production.*
- [x] Add `requireAdminSession` middleware. It accepts **only** the admin cookie and rejects Bearer customer tokens outright. Add `requireRole('admin')` for finer checks, for example only `owner` can promote users.
- [x] Add CSRF protection on mutating admin routes: a double-submit token, or rely on `SameSite=Strict` plus an `Origin` header check.
- [x] Add `POST /api/admin/auth/logout`, `GET /api/admin/auth/me`, and `GET/DELETE /api/admin/sessions` so an admin can list and kill sessions.
- [x] Add TOTP 2FA for admin roles (`otplib`) with recovery codes. *Made mandatory for every admin role, not just owners.*
- [x] Write an audit-log entry for every admin mutation.

### Creating admin credentials
- [x] Remove the default admin from `seed.ts`.
- [x] Add a CLI: `npm run admin:create -- --email you@company.com`. It prompts for a password (never passes it on argv), enforces 12+ characters, and sets `role: 'owner'`. *Built as `npm run admin -- create --email …`, with `reset-password`, `reset-2fa`, `unlock`, `list` and `migrate-roles` alongside.*
- [x] Onboard further admins by **invite**: the owner enters an email, the system sends a one-time link that expires in 24 h, and the invitee sets a password and enrols 2FA. *No email provider yet (Phase 4), so the link is shown once to the inviter. Invites are refused for emails that already have an account.*
- [x] Force a password change on first login.

### Client
- [x] Add a `/admin/login` page with its own minimal layout (no storefront header or cart).
- [x] Add `client/middleware.ts` to redirect `/admin/*` to `/admin/login` when the `admin_sid` cookie is missing. This is a UX gate only; the API is the real one.
- [x] Give `app/admin/(console)/layout.tsx` a server component that calls `/api/admin/auth/me` and redirects when that fails, so no admin UI renders for non-admins.
- [x] Remove the "Admin" link from the storefront `Header`.
- [x] Keep customer auth as-is for now, but plan to move it to httpOnly cookies as well (Phase 5).

**Done when:** a customer token gets a 401 on every `/api/admin/*` route, an admin account logged into the storefront still sees the admin login screen at `/admin`, and every admin action shows up in the audit log.

---

## Phase 2: Admin console (≈2–3 weeks) · ✅ done

*Built Sep 2026. Deviations from the plan are noted in italics.*

A dedicated shell: sidebar navigation, a top bar with ⌘K search across orders, products, customers and pages, and back links on detail pages (*instead of breadcrumbs*). Lists are server-paginated, sortable, filterable and exportable to CSV.

### 2a. Dashboard (`/admin`)
- [x] KPI tiles with change vs the previous period, over a selectable range (24h / 7d / 30d / 12m / all).
- [x] Revenue this period vs previous, and a best-sellers carousel. Revenue is net of refunds.
- [x] Action queues: orders to fulfil and low-stock products, plus a notifications bell.
- [x] Backed by `/api/admin/stats/*`, bucketed in the admin's timezone.

### 2b. Products (`/admin/products`)
- [x] Table with search (name or SKU), category, visibility and stock filters, sorting, units sold, and bulk actions (publish, draft, archive, feature, change category, adjust price by %).
- [x] Create/edit page with a live preview: **image upload** (multiple, drag to reorder), SKU, compare-at price, cost price with a margin readout, featured flag, and draft / active / archived. *Images are stored on the API server's disk behind a storage interface (`server/src/lib/storage.ts`); swap in S3 or Cloudinary for multi-server hosting. Descriptions are plain text, not rich text.*
- [x] Archive instead of delete: products that have sold can only be archived; unsold ones can still be deleted.
- [x] Categories (`/admin/categories`): name, slug, image, sort order. Renaming a slug moves its products; deleting requires moving them.
- [x] Inventory: every stock change is recorded with a reason and who made it; the low-stock threshold is a setting; products import/export as CSV (validated all-or-nothing, with a dry-run preview).

### 2c. Orders (`/admin/orders`)
- [x] Status tabs with counts, date-range and amount filters, search, sorting, CSV export.
- [x] Detail page: line items, customer, shipping, payment (Stripe fee, net), refunds, **status timeline**.
- [x] Statuses `pending → paid → processing → shipped → delivered`, plus `cancelled` and `refunded`. *A partial refund keeps the status and shows a "part refunded" badge rather than a separate status.*
- [x] Server-enforced transitions; only the Stripe webhook marks an order paid.
- [x] Fulfilment: carrier, tracking number and link; printable invoice and packing slip; the customer is emailed when it ships.
- [x] Cancel with optional Stripe refund and restock.
- [x] Internal notes.

### 2d. Customers & staff
- [x] Customer list with lifetime value; detail page with orders, an activity trail (account, orders, emails, staff actions) and notes.
- [x] Actions: disable/enable, and send a password-reset email. Customers can also reset their own password from the store.
- [x] Team: invite, change role, disable/restore, view and end a member's sessions.
- [x] Guards: nobody changes their own account from the team page; owners only change from the CLI.

### 2e. Finances (`/admin/finance`)
- [x] The webhook stores the payment intent, charge, subtotal/tax/shipping and the Stripe fee (idempotently).
- [x] Refunds, full or partial, from the order page through Stripe (idempotency keys), with a reason and optional restock. `charge.refunded` keeps refunds made in the Stripe dashboard in sync.
- [x] Transactions ledger (payments and refunds with gross, fee, net), filterable and exportable.
- [x] Reports: gross vs net over time, refund rate, fee rate, gross margin from cost prices (with coverage), plus revenue by category/product in Analytics.
- [x] Payouts from Stripe, reconciled against the ledger.
- [x] Settings (`/admin/settings`): store name, support email, currency (locked once there are orders), shipping countries, Stripe automatic tax, low-stock threshold.

### 2f. Audit log (`/admin/audit`)
- [x] Filterable (action group, person, dates) list with before/after diffs and CSV export.

---

## Phase 3: Storefront & landing page redesign (≈1–1.5 weeks) · ✅ done

*Built Sep 2026. Deviations from the plan are noted in italics.*

### Structure
- [x] Catalogue moved from `/` to `/shop`: category, search, price range, in-stock and sort (newest, price, name) filters as removable chips, and numbered pagination. Filters sit in a sidebar on desktop and a collapsible panel on mobile.
- [x] `/` rebuilt as a landing page:
  1. **Hero**: gradient panel, headline, subcopy, two CTAs, staggered entrance, scroll parallax and a ken-burns main image. *A collage of featured product photos instead of a stock image, so it always shows real products.*
  2. **Trust bar**: *only claims the store can back up* (Stripe checkout, the real shipping-country count, order tracking, the support email).
  3. **Shop by category**: bento image tiles with hover zoom; a category without its own image uses its first product's.
  4. **Featured products**: *a scroll-snap rail with arrow buttons instead of embla* (no extra dependency).
  5. **Promo split section**, revealed on scroll.
  6. **New arrivals**: the latest 8.
  7. **Testimonials.** *Hidden until the store adds real quotes; nothing is invented.*
  8. **Newsletter signup** (`POST /api/newsletter`, export from Customers) and a full footer with category links, socials and the support email.
- [x] *Landing content is editable in **Settings → Storefront**: announcement bar, hero eyebrow/title/subtitle, promo (with image upload), up to 6 testimonials and social links. Empty sections hide themselves.*
- [x] Header: announcement bar, sticky header with scroll shadow, categories menu, search, account menu, animated cart badge, **cart drawer**, and a mobile menu (Escape closes it).

### Motion
- [x] `motion` for scroll reveal, staggered grids and a page fade between storefront routes.
- [x] Micro-interactions: add-to-cart check animation and cart badge bounce, card hover lift with a second-image crossfade, skeleton shimmer.
- [x] `prefers-reduced-motion` respected: `MotionConfig reducedMotion="user"`, and the CSS keyframes only run under `no-preference`.
- [x] `next/image` with sizes (AVIF/WebP) and priority hero/product images. *Hosts are allow-listed (picsum, the API host, `NEXT_PUBLIC_IMAGE_HOSTS`); images served from localhost fall back to a plain `<img>`.*

### Product page & polish
- [x] Product page: gallery, breadcrumbs, savings vs compare-at price, stock indicator ("Only N left"), quantity stepper, related products, JSON-LD.
- [x] Customer account (`/account`): profile name, password change (signs out other devices), order list, and order detail with a progress tracker, tracking link and address. *`/orders` redirects here.*
- [x] Loading, error and 404 states; per-page metadata, product Open Graph images, a generated default share image, `robots.txt` and `sitemap.xml` (set `NEXT_PUBLIC_SITE_URL`).

---

## Phase 4: Emails & notifications (≈3–4 days) · ✅ done

*Built Sep 2026. Deviations from the plan are noted in italics.*

- [x] Transactional email through Resend: **order confirmation** (items, totals, address), **shipped** with carrier, tracking number and tracking link, **refund issued**, **order cancelled** (one email covering the cancellation and its refund), **password reset** and **admin invite**. Replies go to the store's support email. *Templates are a small block renderer (`server/src/lib/email-template.ts`) that produces matching HTML and plain-text bodies with every value escaped, instead of React Email, to keep React off the API.*
- [x] Emails are idempotent where Stripe can redeliver: the confirmation is sent once per order however often the webhook fires. A failed send is logged and never undoes the payment, refund or status change.
- [x] Invites are emailed; the link is only shown to the inviter when email isn't set up or the send failed.
- [x] Admin notifications: a feed under the console bell for **new orders**, **low stock / out of stock** (when a product crosses the threshold, not on every sale) and **failed Stripe webhooks** (once per event, marked resolved when a retry succeeds). Read state is per person; payment problems are shown only to owners and admins.
- [x] *Per-person email alerts* in Account & security (new orders, stock, payment problems), with sensible role defaults.
- [x] *Settings shows whether email is connected and can send a test email; the customer activity trail notes emails that weren't sent because email isn't set up.*

## Phase 5: Hardening & launch (≈1 week)

- [ ] Move customer auth to httpOnly cookies as well, plus a refresh flow.
- [ ] Stock reservation at checkout. The README already notes the overselling risk.
- [ ] Webhook event log (store processed `event.id`s) for idempotency and debugging.
- [ ] End-to-end tests (Playwright) for checkout, admin login and refunds.
- [ ] CI (GitHub Actions): typecheck, test, build.
- [ ] Monitoring (Sentry), structured logs, and a `/health` check that includes the database.
- [ ] Deployment: client on Vercel, API on Render, Railway or Fly, and MongoDB Atlas. Production Stripe keys and webhook endpoint.

---

## Suggested order

```
Phase 0 ──► Phase 1 (admin auth) ──► Phase 2a/2b/2c ──► 2d ──► 2e (finance) ──► 2f
                     └──────────────► Phase 3 (landing) in parallel ─────────────┘
                                                                     ──► Phase 4 ──► Phase 5
```

Phase 1 goes first because it changes the user model and moves every admin endpoint. Building admin screens before it means building them twice. In Phase 2, finance comes after orders because refunds and ledgers depend on the payment-intent data that the orders work starts storing.

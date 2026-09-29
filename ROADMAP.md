# Roadmap

Where the app is today, and what it takes to get to a polished storefront plus a real admin back office.

## Where things stand

| Area | Today | Gap |
| --- | --- | --- |
| Landing (`client/app/page.tsx`) | Heading, search bar and a product grid | No hero, no featured or category sections, no motion. The catalogue *is* the landing page. |
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

## Phase 2: Admin console (≈2–3 weeks) · 🟡 in progress

*Status (Sep 2026): the console shell, dashboard, orders, products, customers, analytics and team pages are built
(design inspired by the "Admin E-Commerce Dashboard" concept). Unchecked items below remain.*

A dedicated shell: sidebar navigation (shadcn `sidebar`; the tokens already exist), top bar with a global search, and breadcrumbs. Every list is server-paginated, sortable, filterable and exportable to CSV.

### 2a. Dashboard (`/admin`)
- [x] KPI tiles with change vs the previous period, over a selectable range (24h / 7d / 30d / 12m / all). *Refunds wait for 2e.*
- [x] A revenue-over-time chart (recharts), this period vs previous, and a best-sellers carousel.
- [x] Action queues: orders awaiting shipment and low-stock products, plus a notifications bell. *Failed payments wait for 2e.*
- [x] Backed by `GET /api/admin/stats/overview` and `/stats/analytics`, using Mongo aggregation pipelines bucketed in the admin's timezone.

### 2b. Products (`/admin/products`)
- [x] A table with search, category and stock filters, sorting and units sold. *Bulk actions still to do.*
- [ ] A dedicated create/edit page instead of the inline form (*done, with a live preview; the rest of this item is not*): rich description, **image upload** (Cloudinary or S3 presigned URLs) with multiple images and reordering, SKU, compare-at price, cost price (needed for margin reporting), `featured` flag (feeds the landing page), and `status: draft | active | archived`.
- [ ] Replace hard delete with archive. Orders reference products, so archived products stay resolvable.
- [ ] Categories management (`/admin/categories`): name, slug, image and sort order. This turns the free-text `category` string into a `Category` model.
- [ ] Inventory: stock-adjustment history (a reason plus who made it), a configurable low-stock threshold, and CSV import/export.

### 2c. Orders (`/admin/orders`)
- [x] Status tabs with counts, sorting, search by order # / customer / email, CSV export. *Date-range and amount filters still to do.*
- [x] An order detail page (`/admin/orders/[id]`): line items, customer, shipping address, payment info, and a **status timeline** (`statusHistory` on the order).
- [ ] Expand the status model to `pending → paid → processing → shipped → delivered`, plus `cancelled` and `refunded` / `partially_refunded`.
- [x] Enforce status transitions on the server with a state machine, so `pending → paid` is only possible from the webhook.
- [ ] Fulfilment: carrier, tracking number and tracking URL, a printable packing slip and invoice, and email the customer on ship.
- [x] Cancel with a restock option. *The refund itself is still done in Stripe until 2e.*
- [ ] Internal notes on orders.

### 2d. Customers & staff (`/admin/users`)
- [x] A customer list with search, joined date, order count and lifetime value.
- [x] A customer detail page: profile, order history and totals. *Activity trail still to do.*
- [ ] Actions: disable/enable the account (*done, bumps `tokenVersion`*), trigger a password-reset email, and add notes.
- [x] A team tab: invite, change role (owner), disable/restore access. *Viewing another member's sessions still to do.*
- [x] Guards: nobody can change their own account from the team page, and owners are only changed from the CLI.

### 2e. Finances (`/admin/finance`)
- [ ] **Store the Stripe `payment_intent` id and charge id** on the order in the webhook. This is a prerequisite for everything else here.
- [ ] Record `amountSubtotal`, `amountTax`, `amountShipping`, `amountTotal`, and the Stripe fee (from the balance transaction), so the admin sees net revenue.
- [ ] Refunds: full or partial from the order page via `stripe.refunds.create`, with a reason. Handle the `charge.refunded` webhook to keep the order in sync, and optionally restock.
- [ ] A transactions ledger: every payment and refund with gross, fee and net, filterable by date and exportable to CSV for accounting.
- [ ] Reports: revenue by day, week or month; by category and by product; gross margin (using cost price); refund rate.
- [ ] Payouts: list Stripe payouts (`stripe.payouts.list`) and reconcile them against the ledger.
- [ ] Settings (`/admin/settings`): store name, currency, allowed shipping countries (currently hard-coded in `checkout.ts`), tax behaviour, and low-stock threshold.

### 2f. Audit log (`/admin/audit`)
- [ ] A read-only, filterable list of every admin action (who, what, when, before and after).

---

## Phase 3: Storefront & landing page redesign (≈1–1.5 weeks)

Can run in parallel with Phase 2 once Phase 1's model changes (`featured`, `Category`) land.

### Structure
- [ ] Move the catalogue from `/` to `/shop`, keeping the search, filters and pagination that exist today, and add price and sort filters.
- [ ] Rebuild `/` as a landing page with these sections:
  1. **Hero**: a full-bleed image or gradient, a headline, a subcopy line and two CTAs (Shop now, Browse categories). Use a staggered fade-and-rise entrance with a subtle parallax or ken-burns effect on the image.
  2. **Trust bar**: free shipping, secure checkout, easy returns.
  3. **Shop by category**: image tiles from the `Category` model, with a hover zoom and overlay.
  4. **Featured products**: products flagged `featured`, as a carousel (embla via shadcn `carousel`) or grid.
  5. **Promo or editorial split section**: image plus copy, revealed on scroll.
  6. **New arrivals**: the latest 8 products.
  7. **Testimonials or social proof.**
  8. **Newsletter signup and a proper footer**: links, socials, legal.
- [ ] Improve the header: logo, category menu, search, cart drawer (a slide-over instead of navigating to `/cart`), and a user menu.

### Motion
- [ ] Add **`motion`** (Framer Motion) for scroll-reveal (`whileInView`), staggered grids and page transitions. `tw-animate-css` is already installed for simple enter/exit effects.
- [ ] Add micro-interactions: add-to-cart feedback that animates the cart badge, card hover lift, and skeleton shimmer while loading.
- [ ] Respect `prefers-reduced-motion` everywhere.
- [ ] Performance budget: use `next/image` with proper sizes, a priority-loaded hero image, and aim for LCP under 2.5 s. Animations should use only `transform` and `opacity`.

### Product page & polish
- [ ] Product page: image gallery, related products, stock indicator, breadcrumbs.
- [ ] Customer account area (`/account`): profile, password change, order detail with tracking.
- [ ] Empty, loading and error states for every page, and SEO metadata and Open Graph images per product.

---

## Phase 4: Emails & notifications (≈3–4 days)

- [ ] Transactional email (Resend or Postmark with React Email): order confirmation, shipped with tracking, refund issued, password reset, admin invite.
- [ ] Admin notifications for new orders, low stock and failed webhooks.

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

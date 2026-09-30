# E-commerce App

Next.js (React) storefront + Express/Node API + MongoDB + Stripe Checkout.
TypeScript throughout, styled with Tailwind CSS v4 and shadcn/ui.

```
client/   Next.js 15 App Router frontend   (http://localhost:3000)
server/   Express + Mongoose REST API      (http://localhost:5000)
```

## Setup

Requires Node 20.6+ and a MongoDB instance (local or Atlas).

```bash
# API
cd server
cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, DATA_ENCRYPTION_KEY, Stripe keys
npm install
npm run seed              # sample products
npm run admin -- create --email you@example.com   # first owner account (prompts for a password)
npm run dev

# Frontend (new terminal)
cd client
cp .env.example .env.local
npm install
npm run dev
```

### Stripe webhook (local)

Orders are marked paid by the webhook, not by the browser redirect.

```bash
stripe listen --forward-to localhost:5000/api/webhook
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` and restart the API.
Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

### Upgrading an existing database

Older databases have `isAdmin` flags instead of roles. Run once:

```bash
npm run admin -- migrate-roles
```

Migrated admins must change their password and enrol 2FA at their next sign-in.

## Storefront

| Route | What it is |
| --- | --- |
| `/` | Landing page: hero, trust bar, category tiles, featured rail, promo, new arrivals, testimonials, newsletter |
| `/shop` | Catalogue with category, search, price, in-stock and sort filters (all in the URL) |
| `/products/:id` | Gallery, stock indicator, related products, Open Graph and JSON-LD |
| `/cart` | Full cart; the header cart button opens a slide-over drawer instead |
| `/account` | Profile, orders with a delivery tracker, password change (`/orders` redirects here) |

- **Editing the home page**: *Settings → Storefront* in the admin console sets the announcement bar,
  hero copy, promo section, testimonials and social links. Sections with no content are hidden, and
  changes show within a minute (pages revalidate every 60 s).
- **Hero and featured images** come from products marked *featured*; category tiles use the
  category's image, or its first product's.
- **Images** go through `next/image` for allow-listed hosts: picsum, the API host from
  `NEXT_PUBLIC_API_URL`, and any in `NEXT_PUBLIC_IMAGE_HOSTS` (comma-separated, e.g. your CDN).
  Other hosts and `localhost` use a plain `<img>`.
- **SEO**: set `NEXT_PUBLIC_SITE_URL` to the public storefront URL; it is used for canonical links,
  `sitemap.xml`, `robots.txt` and share images.
- **Motion** uses `motion` and honours the OS "reduce motion" setting.

## Admin console

The admin console at `/admin` is separate from the storefront. Signing in to the shop never grants
admin access, even for an account with an admin role.

- **Sign-in** at `/admin/login`: password, then a TOTP code from an authenticator app (or a
  one-time recovery code). Five failures lock the account for 15 minutes.
- **Session**: an opaque random token in an `httpOnly`, `SameSite=Strict` cookie (`__Host-admin_sid`
  in production). Only its SHA-256 is stored, in `AdminSession`. Sessions end after 30 minutes idle
  or 8 hours total, and die when the user's role, status or password changes.
- **Same-origin proxy**: the browser calls `/api/admin/*` on the Next.js origin, which rewrites to the
  API (`client/next.config.ts`), so the cookie is first-party. The API also rejects state-changing
  requests whose `Origin` isn't `CLIENT_URL`, and refuses storefront Bearer tokens outright.
- **Account setup**: a new or reset account gets a restricted session that can only change its
  password and enrol 2FA (`/admin/setup`). 2FA is required for every admin role.
- **Roles**: `staff` manages products and orders; `admin` can also invite staff and read the audit log;
  `owner` can invite admins. Owners are created only from the CLI.
- **Invites**: the Team page emails a one-time link (valid 24 h). Without email set up, the link is shown once to the inviter instead. Invites never
  attach staff access to an existing account: staff use a separate email from any shopping account.
- **Audit log**: every sign-in, failed attempt and admin write is recorded in `AuditLog`.
- **Gating** happens in three layers: `client/middleware.ts` redirects when there's no cookie, the
  `(console)` layout validates the session with the API before rendering, and the API checks every
  request.

### Console pages

| Page | What it does |
| --- | --- |
| Categories | Names, slugs, images and order for grouping products |
| Finance | Gross, fees, refunds and net from the Stripe ledger; margin; transactions (CSV); payouts reconciled against the ledger (owners/admins) |
| Audit log | Every admin action, filterable, with before/after diffs and CSV export (owners/admins) |
| Settings | Store name, support email, currency, shipping countries, Stripe automatic tax, low-stock threshold, email status and test, and the storefront's home-page content |
| Overview (`/admin`) | Date range (24h / 7d / 30d / 12m / all), KPI tiles with change vs the previous period, sales report (revenue this vs previous period), latest transactions, best-sellers carousel, items needing attention |
| Orders | Status tabs with counts, search by customer/email/order #, sorting, CSV export, detail page with timeline, *Mark as shipped* and *Cancel* (with optional restock) |
| Products | Search, category and stock filters, units sold, stock meter; create/edit with a live preview |
| Customers | Lifetime value, order count, last order; detail page with order history; owners/admins can disable accounts and export the newsletter list |
| Analytics | Revenue, orders, average order value, revenue by category, orders by status, top products and customers |
| Team | Members (owners/admins change roles and access) and invites |
| Account & security | Password, 2FA status, signed-in sessions, email alerts |

Every chart has a table view (the grid icon on its card). Filters live in the URL, so a filtered
view can be bookmarked or shared. Reports bucket by the admin's own timezone.

The sidebar badge and the bell poll `/api/admin/notifications` every minute. The bell shows what needs
attention (orders waiting to ship, low stock) and a feed of events: new orders, products crossing into
low or out of stock, and Stripe webhooks that failed (owners/admins only, marked resolved when Stripe's
retry succeeds). Each person chooses which of these are also emailed to them in *Account & security*.

Order detail pages have printable invoices and packing slips, refunds (owners/admins) and internal
notes. Press **Ctrl/⌘ K** anywhere in the console to search orders, products and customers.

### Images, email and money

- **Product images** upload to `server/uploads/` (`UPLOAD_DIR`) and are served at `/uploads/*` with a
  locked-down CSP. Set `PUBLIC_API_URL` to the API's public origin so image URLs work from the storefront.
  For several API servers, implement `ImageStore` in `server/src/lib/storage.ts` against S3/Cloudinary.
- **Email** goes through Resend when `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain
  verified in Resend) are set; otherwise it's printed to the API console in development. Customers get
  order confirmation, shipped (with tracking), refund, cancellation and password-reset emails; staff get
  invites and opt-in alerts. Replies go to the support email from Settings, which also has a
  *Send me a test email* button. Only metadata is logged (`EmailLog`), never bodies (some carry one-time links).
  Templates live in `server/src/lib/emails.ts` and render through `email-template.ts`.
- **Stripe webhook events** to enable: `checkout.session.completed`, `checkout.session.expired`,
  `charge.refunded`. Payments are recorded with Stripe's fee in the `Transaction` ledger.

### Demo data

To see the dashboard with realistic history, from `server/`:

```bash
npm run seed                 # sample products, if you have none
npm run demo -- seed         # ~100 customers and ~2,000 orders over 14 months
npm run demo -- clear        # removes exactly what demo seed added
```

Demo customers use the `@demo.shop.test` domain; `clear` deletes only them and their orders.

### Admin CLI (`server/`)

| Command | |
| --- | --- |
| `npm run admin -- create --email <e> [--name <n>] [--role owner|admin|staff]` | Create a staff account. Leave the password blank to get a temporary one that must be changed. |
| `npm run admin -- set-role --email <e> --role <owner|admin|staff|customer>` | Change an existing account's role, e.g. give your shopping account staff access for testing. Gaining staff access forces a new 12+ char password and 2FA at first admin sign-in. |
| `npm run admin -- reset-password --email <e>` | Temporary password, forced change, signs out everywhere |
| `npm run admin -- reset-2fa --email <e>` | Clear 2FA so it can be enrolled again |
| `npm run admin -- unlock --email <e>` | Clear a failed-login lockout |
| `npm run admin -- list` | List staff accounts |
| `npm run admin -- migrate-roles` | Convert legacy `isAdmin` users |

Passwords are typed at a hidden prompt, never passed as arguments.

### Deploying the admin console

- The storefront and API must share a registrable domain (e.g. `shop.com` and `api.shop.com`), or the
  API sits behind the same origin, and `API_ORIGIN` must point the Next.js server at the API.
- Set `TRUST_PROXY` to match your load balancer so audit logs and rate limits see real client IPs.
- Serve over https; the `__Host-` cookie prefix requires it.

## Scripts

| | `server/` | `client/` |
| --- | --- | --- |
| dev | `npm run dev` (tsx watch) | `npm run dev` |
| build | `npm run build` → `dist/` | `npm run build` |
| start | `npm start` (runs `dist/`) | `npm start` |
| types | `npm run typecheck` (src + tests) | `npm run typecheck` |
| test | `npm test` (vitest, in-memory MongoDB) | – |
| seed | `npm run seed` | – |
| admin | `npm run admin -- <command>` | – |

## TypeScript notes

- The API is ESM with `"module": "NodeNext"`, so **relative imports keep a `.js` extension**
  in the source (`import { connectDB } from './config/db.js'`) even though the files are `.ts`.
- Mongoose models export both the plain interface and the hydrated document type, e.g.
  `IProduct` / `ProductDoc` in `server/src/models/Product.ts`.
- `req.user` and `req.admin` are declared globally in `server/src/types/express.d.ts` as optional.
  Routes behind `protect` call `requireUser(req)`; routes behind `requireAdminSession` call
  `requireAdmin(req)`, instead of using non-null assertions.
- Request bodies and queries are parsed with zod via `parse(schema, input)`
  (`server/src/middleware/validate.ts`), which turns the first issue into a 400.
- `src/app.ts` builds the Express app; `src/index.ts` connects and listens. Tests import `createApp()`.
- The client mirrors the API's response shapes in `client/types/index.ts`; `api<T>()` is generic,
  so `api<ProductsResponse>('/products')` is fully typed. These types are hand-kept in sync with
  the server — there is no generated client yet.

## Styling

Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (style `base-nova`, built on **Base UI**,
not Radix). There is no hand-written CSS beyond the theme tokens.

- Tailwind v4 is configured entirely in `app/globals.css` (`@import "tailwindcss"`) plus
  `postcss.config.mjs`. There is no `tailwind.config.js`.
- Theme tokens (`--background`, `--primary`, `--radius`, …) live in `:root` and `.dark` in
  `app/globals.css`. Change colours there, not in components. Dark mode is a `.dark` class
  toggled by `components/ThemeToggle.tsx` (follows the OS until the user picks).
- Generated primitives are in `components/ui/` and are yours to edit. Add more with
  `npx shadcn@latest add <component>`.
- These components import `cn` from the **`cn` package**, not `@/lib/utils`
  (`lib/utils.ts` just re-exports it). Keep that import when hand-writing new ones.
- This shadcn build has no `asChild` prop. To style a `next/link` as a button, apply
  `buttonVariants({ variant, size })` to its `className` — see `components/Header.tsx`.
- `Button` and `Input` render in server components; `Select`, `Table` and `Label` are
  client-only. On `/shop`, categories are links and the price filter is a plain GET form, so both work without JavaScript.
- `next.config.ts` exists mainly because the shadcn CLI needs it to detect Next.js.

## How checkout works

1. Cart lives in the browser (`localStorage`).
2. `POST /api/checkout` sends only product ids + quantities. The server reads prices/stock from MongoDB,
   creates a `pending` order, and returns a Stripe Checkout URL.
3. Stripe redirects to `/checkout/success`; meanwhile `checkout.session.completed` hits `/api/webhook`,
   which marks the order `paid`, saves the shipping address and decrements stock (idempotently).

## API

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot`, `/api/auth/reset` | – |
| GET | `/api/settings` (store name, currency, storefront content, shipping countries) | – |
| POST | `/api/newsletter` | – (rate-limited) |
| PATCH, POST | `/api/auth/me` (name), `/api/auth/password` | customer token |
| GET | `/api/auth/me` | customer token |
| GET | `/api/products` (`q`, `category`, `sort`, `minPrice`, `maxPrice`, `inStock`, `featured`, `exclude`), `/api/products/:id`, `/api/products/categories` | – |
| POST | `/api/checkout` | customer token |
| GET | `/api/orders/mine`, `/api/orders/:id` | customer token |
| POST | `/api/webhook` | Stripe signature |
| POST | `/api/admin/auth/login`, `/login/2fa`, `/logout` | – |
| GET/POST | `/api/admin/invitations/:token[/accept]` | invite token |
| GET/POST | `/api/admin/auth/me`, `/password`, `/2fa/setup`, `/2fa/enable` | admin session (setup may be pending) |
| GET/DELETE | `/api/admin/sessions[/:id]` | admin session |
| POST/PUT/DELETE | `/api/admin/products[/:id]` | admin session, setup complete |
| GET, PATCH | `/api/admin/orders[/:id]`, `/api/admin/orders/:id/status` (enforced transitions; only Stripe marks orders paid) | admin session, setup complete |
| GET | `/api/admin/stats/overview`, `/api/admin/stats/analytics` (`from`, `to`, `unit`, `tz`) | admin session, setup complete |
| GET | `/api/admin/orders/export` (CSV), `/api/admin/products[/:id]`, `/api/admin/customers[/:id]`, `/api/admin/notifications` | admin session, setup complete |
| PATCH | `/api/admin/customers/:id/status` | owner, admin |
| GET, PATCH | `/api/admin/team[/:id]` | owner, admin |
| GET/POST/PUT/DELETE | `/api/admin/categories[/:id]`, `/api/admin/uploads/images`, products `/bulk`, `/import`, `/export`, `/:id/stock` | admin session, setup complete |
| POST | `/api/admin/orders/:id/refunds` | owner, admin |
| GET | `/api/admin/finance/*`; PATCH `/api/admin/settings` | owner, admin |
| GET | `/api/admin/search?q=` | admin session, setup complete |
| GET, POST | `/api/admin/notifications`, `/api/admin/notifications/read` | admin session, setup complete |
| GET, PUT | `/api/admin/notifications/preferences` (your own email alerts) | admin session, setup complete |
| POST | `/api/admin/settings/test-email` | owner, admin |
| GET/POST/DELETE | `/api/admin/invites[/:id]` | owner, admin |
| GET | `/api/admin/audit`, `/api/admin/customers/subscribers/export` (CSV) | owner, admin |

## Notes / next steps

- Prices are stored as integer cents.
- Storefront JWTs are kept in `localStorage`; moving them to httpOnly cookies is roadmap phase 5.
  They carry an audience and the user's `tokenVersion`, so bumping it revokes them.
- Stock is checked at checkout and decremented on payment; add reservation if overselling matters.
- API tests live in `server/test`; there are no browser/E2E tests yet (roadmap phase 5).

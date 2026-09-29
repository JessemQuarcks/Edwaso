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
cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, Stripe keys
npm install
npm run seed              # sample products + admin user (admin@example.com / admin12345)
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

## Scripts

| | `server/` | `client/` |
| --- | --- | --- |
| dev | `npm run dev` (tsx watch) | `npm run dev` |
| build | `npm run build` → `dist/` | `npm run build` |
| start | `npm start` (runs `dist/`) | `npm start` |
| types | `npm run typecheck` | `npm run typecheck` |
| seed | `npm run seed` | – |

## TypeScript notes

- The API is ESM with `"module": "NodeNext"`, so **relative imports keep a `.js` extension**
  in the source (`import { connectDB } from './config/db.js'`) even though the files are `.ts`.
- Mongoose models export both the plain interface and the hydrated document type, e.g.
  `IProduct` / `ProductDoc` in `server/src/models/Product.ts`.
- `req.user` is declared globally in `server/src/types/express.d.ts` as optional. Routes behind
  `protect` call `requireUser(req)` to narrow it instead of using non-null assertions.
- The client mirrors the API's response shapes in `client/types/index.ts`; `api<T>()` is generic,
  so `api<ProductsResponse>('/products')` is fully typed. These types are hand-kept in sync with
  the server — there is no generated client yet.

## Styling

Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (style `base-nova`, built on **Base UI**,
not Radix). There is no hand-written CSS beyond the theme tokens.

- Tailwind v4 is configured entirely in `app/globals.css` (`@import "tailwindcss"`) plus
  `postcss.config.mjs`. There is no `tailwind.config.js`.
- Theme tokens (`--background`, `--primary`, `--radius`, …) live in `:root` and `.dark` in
  `app/globals.css`. Change colours there, not in components. Dark mode is wired up via a
  `.dark` class but nothing toggles it yet.
- Generated primitives are in `components/ui/` and are yours to edit. Add more with
  `npx shadcn@latest add <component>`.
- These components import `cn` from the **`cn` package**, not `@/lib/utils`
  (`lib/utils.ts` just re-exports it). Keep that import when hand-writing new ones.
- This shadcn build has no `asChild` prop. To style a `next/link` as a button, apply
  `buttonVariants({ variant, size })` to its `className` — see `components/Header.tsx`.
- `Button` and `Input` render in server components; `Select`, `Table` and `Label` are
  client-only. The catalogue filter on `/` deliberately uses a native `<select>` so the form
  still submits without JavaScript.
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
| POST | `/api/auth/register`, `/api/auth/login` | – |
| GET | `/api/auth/me` | user |
| GET | `/api/products`, `/api/products/:id`, `/api/products/categories` | – |
| POST/PUT/DELETE | `/api/products[/:id]` | admin |
| POST | `/api/checkout` | user |
| GET | `/api/orders/mine`, `/api/orders/:id` | user |
| GET | `/api/orders`, PATCH `/api/orders/:id/status` | admin |
| POST | `/api/webhook` | Stripe signature |

## Notes / next steps

- Prices are stored as integer cents.
- JWTs are kept in `localStorage` for simplicity; for production consider httpOnly cookies.
- Stock is checked at checkout and decremented on payment; add reservation if overselling matters.
- No automated tests yet.

# Spec — Stripe Billing (subscribe → webhook → entitlement)

Date: 2026-07-07 · Branch: `feat/supabase-shared-services` · Builds on Phases 1–2.

## Goal

Let a user subscribe to a plan and have it drive their entitlement: Stripe Checkout
→ webhook writes `customers`/`subscriptions` → `user_entitlements` updates → the
Phase 2 slot gate enforces the paid cap. Includes Customer Portal for
manage/cancel.

## Flow

1. Billing page reads the catalogue from cloud `prices`/`products` (public read),
   shows STARTER/PARTY/GUILD + current plan.
2. Subscribe → `POST /api/billing/checkout` (server; invokes `create-checkout-session`
   Edge Function with the user's JWT) → Checkout URL → app opens it in the OS
   browser (`window.open` routed via Electron `setWindowOpenHandler` →
   `shell.openExternal`).
3. Stripe redirects to `realmsync://checkout-callback` → Electron routes to
   `/dashboard/billing?checkout=success` → the page polls `POST /api/billing/refresh`
   (re-reads `user_entitlements`, re-syncs the local mirror) to cover webhook lag.
4. `stripe-webhook` Edge Function writes `customers`/`subscriptions` and syncs the
   price catalogue; idempotent via `stripe_events`.
5. Manage → `POST /api/billing/portal` → `create-portal-session` → Stripe Customer
   Portal URL → OS browser.

## Trust boundary

Edge Functions (Deno, on Supabase) hold the Stripe secret + service_role and are
the only components that write billing rows. The desktop app never holds those —
it calls the functions with the user's JWT (verify_jwt) or Stripe calls the
webhook (verify_jwt=false, Stripe-signature verified).

## Build (code)

- Edge Functions: finalize `stripe-webhook` (checkout.session.completed,
  customer.subscription.*, product.*/price.* catalogue sync, idempotency);
  `create-checkout-session`; new `create-portal-session`.
- Next API routes: `/api/billing/checkout`, `/api/billing/portal`,
  `/api/billing/refresh` (re-sync entitlement mirror from cloud).
- Billing page: real plan picker + current plan + Subscribe/Manage; auto-refresh on
  `?checkout=success`.
- Electron `main.js`: `setWindowOpenHandler` → `shell.openExternal` for http(s);
  route `realmsync://checkout-callback` → `/dashboard/billing?checkout=success`
  (Windows argv/second-instance + macOS `open-url`).

## Go-live (Jimmy, guided — no live actions by the agent)

Create Stripe account (test mode) + 3 products/prices with metadata
`{plan, active_slots}`; get `sk_test`/`pk_test`; deploy the 3 Edge Functions
(`npx supabase functions deploy …`); register the webhook endpoint → set
`STRIPE_WEBHOOK_SECRET`; `supabase secrets set STRIPE_SECRET_KEY …`. Configure the
Customer Portal in the Stripe dashboard (Billing → Customer portal).

## Verification

- Web parts (this Mac): billing page renders plans from seeded/synced `prices`;
  `/api/billing/*` routes invoke the Edge Functions and return URLs; `/refresh`
  re-syncs the mirror. Full checkout tested in Stripe **test mode** once the
  functions are deployed (test card 4242…), asserting the subscription row +
  entitlement + gate update.
- Electron open/deep-link: verified in an Electron run (best-effort on macOS via
  `open-url`; authoritative on the Windows target).

## Pricing note (non-blocking)

Free is dormant at 999 while paid = 1/2/4, so subscribing currently lowers the cap.
Reconcile (e.g. free=1, paid=2/4/8) before real launch; irrelevant to the plumbing.

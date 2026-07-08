# Spec — App Wiring Phase 2: Entitlement Enforcement

Date: 2026-07-07 · Branch: `feat/supabase-shared-services` · Builds on Phase 1 (Supabase Auth).

## Goal

Make `active_slots` real: read a user's entitlement from the cloud
`user_entitlements` view and enforce it at the two server-creation paths. Paid
caps come from Stripe (later); free users get a configurable FREE-tier default.

## Model

A "slot" = a server the user owns (`server.count({ where: { userId } })`), matching
the dashboard's `servers.length`. Archived servers don't count. The cap is
`activeSlots` from entitlement.

## Decisions (confirmed)

- **FREE tier is dormant:** default `FREE_TIER_SLOTS = 999`, env-overridable, so the
  gate is fully built and proven but doesn't constrain anyone until real (lower)
  paid entitlements exist in the cloud — or until the number is tightened. Stripe
  is not wired yet, so every user currently resolves to FREE.
- Paid catalogue (`prices.active_slots`) stays STARTER/PARTY/GUILD = 1/2/4 for now;
  bump above the free number when billing goes live.

## Components — `src/lib/entitlement.ts`

- `FREE_TIER_SLOTS = Number(process.env.FREE_TIER_SLOTS ?? 999)`.
- `getEntitlement(client?)` — reads cloud `user_entitlements` (RLS-scoped to the
  user's own row) via the Supabase server client. Accepts an optional client so the
  login route can pass the just-authenticated client (fresh cookies aren't on the
  request yet within the same request). Falls back to the free tier on no row / error.
- `syncEntitlementToMirror(userId, ent)` — upserts the local `Subscription` mirror
  so the dashboard (reads `subscription.activeSlots`) reflects entitlement.
- `checkServerSlot(userId)` — `{ ok, used, total, plan }`; `ok = used < total`.

## Wiring

- **Gate both creation paths**, immediately after auth (before preflight/validation):
  - `POST /api/servers` and `POST /api/marketplace/deploy` → if `!ok`, return
    **`403`** `{ error, code: "SLOT_LIMIT", used, total, plan }`.
- **Login** (`POST /api/auth/login`): after `ensureLocalUser`, call
  `getEntitlement(sameClient)` + `syncEntitlementToMirror`. (Uses the authenticated
  client so paid entitlement is read correctly within the request.)
- `ensureLocalUser` seeds the mirror at `FREE_TIER_SLOTS` (was hardcoded `999`).
- `.env.example`: add `FREE_TIER_SLOTS`.

Dashboard, `getAuthenticatedUser`, and the ~85 auth callers are unchanged.

## Freshness

Mirror synced on login; the create-gate reads cloud live. Post-Stripe, add a
webhook/refresh path so mid-session upgrades reflect without re-login.

## Verification (live)

Because FREE is dormant, verify the gate by simulating a paid entitlement:
1. Admin-create a pre-confirmed test user; insert a cloud `subscriptions` row
   (`status=active, active_slots=1`) via service_role so `user_entitlements`
   returns 1 for them.
2. Login through the app → assert the local mirror synced to `activeSlots=1`.
3. Seed 1 server row directly → `POST /api/servers` returns **403 SLOT_LIMIT**
   (used 1 ≥ 1), before preflight.
4. Remove the server → `POST /api/servers` no longer returns SLOT_LIMIT (gate
   passes; any later 400/404 is past the gate).
5. Clean up: delete the subscription row, the auth user, and local test rows.

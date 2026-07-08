# Spec — App Wiring Phase 1: Supabase Auth

Date: 2026-07-07 · Branch: `feat/supabase-shared-services` · Depends on the live
Supabase project (schema applied, RLS verified).

## Goal

Replace the app's custom bcrypt + JWT (`gv_session`) auth with **Supabase Auth**
(email/password), while keeping the app's existing server-side, cookie-based
session shape so the ~40 callers of `getAuthenticatedUser()` are untouched.

Out of scope for this phase: Discord OAuth (redirect/deep-link flow), entitlement
enforcement (Phase 2), marketplace-to-cloud (Phase 3), password reset email/SMTP.

## Guiding principle

`src/lib/auth.ts` keeps its public contract. In particular
`getAuthenticatedUser()` returns the same object it does today (a local `User`
with `subscription` included, secrets stripped). Only its internals change. No
dashboard page or API route that calls it needs edits.

## Architecture

- Add `@supabase/ssr` + `@supabase/supabase-js`. The app uses **anon key + the
  user's session only** — no service-role key, no direct Postgres. RLS remains the
  security boundary (already verified live).
- Supabase auth cookies replace `gv_session`. A new `src/middleware.ts` refreshes
  the session per request (canonical `@supabase/ssr` pattern — the one place
  allowed to write refreshed cookies; server components/route handlers only read).
- Email/password sign-in/up runs **server-side** in the existing `/api/auth/*`
  routes (no browser redirect). Login/register forms keep POSTing the same shapes
  and reading the same `{ success, user } | { error }` responses.

### Decisions (confirmed)
- **Session validation:** use `supabase.auth.getUser()` (revalidates the JWT) in
  `getAuthenticatedUser()`. Accept a network hop per request for now; an
  offline/cache pass (`getSession()` fallback) is a later enhancement.
- **Reset-password:** stub with a "coming soon" response; wire Supabase
  `resetPasswordForEmail` when SMTP is configured (go-live item).

## Identity model (greenfield — no user migration)

- `auth.users` is the source of truth. The local `User` row is a **thin mirror
  keyed by the Supabase `uid`** (`User.id = uid`), so local FKs (`Server.userId`,
  `ActivityLog.userId`, etc.) keep working.
- `getAuthenticatedUser()`: resolve Supabase user from cookies → **lazily upsert**
  the local mirror if absent (self-heals after reinstall) → return with
  `subscription`, same shape as today.
- Local Prisma migration: `User.passwordHash` becomes **optional**. `bcryptjs` /
  `jsonwebtoken` become dead code (removable in a later cleanup).
- **Admin stays local this phase:** the "first user → ADMIN" rule sets local
  `User.role`. Cloud `profiles.role` is service-role-locked and not settable from
  the app; cloud admin is a later trusted-path concern (only used by marketplace
  RLS, which is Phase 3).

## Flows

- **Register** (`POST /api/auth/register`): `supabase.auth.signUp({ email,
  password, options:{ data:{ full_name }}})` → cloud `handle_new_user()` trigger
  creates the `profiles` row + extracts name → upsert local `User` mirror (id=uid)
  → create local `Subscription` mirror (kept for dashboard slot display until
  Phase 2) → first local user gets `role=ADMIN` → activity log → same JSON shape.
- **Login** (`POST /api/auth/login`): `supabase.auth.signInWithPassword` →
  upsert/refresh local mirror → activity log → same JSON shape. 401 on failure.
- **Logout** (`POST /api/auth/logout`): `supabase.auth.signOut()` (clears cookies).
- **Session resolve** (`getAuthenticatedUser`): as above.
- **Entry routing** (`pickEntryPath` + `/start`): simplify to **authenticated →
  `/dashboard`, else → `/login`** (register reachable from login). Update its unit
  test (drop the `userCount` heuristic, which was local-single-user thinking).

## Files

**New:** `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`,
`src/middleware.ts`.
**Modified:** `src/lib/auth.ts`, `src/app/api/auth/{login,register,logout,
reset-password}/route.ts`, `src/lib/authEntry.ts`, `src/app/start/page.tsx`,
`prisma/schema.prisma` (+ new local migration), `package.json`.

## Environment

Uses existing `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already
in `.env`). `JWT_SECRET` becomes unused.

## Edge cases / de-risking

- **Secure cookies on `http://127.0.0.1`**: Chromium treats 127.0.0.1 as a secure
  context, so cookie behavior matches today's `gv_session` in the packaged app.
- **Middleware in the Electron standalone build**: standalone includes middleware;
  verify it runs in the packaged server during testing.
- **Email confirmations**: `config.toml` sets `enable_confirmations = false`, so
  signup yields an immediate session (no email round-trip) — required for a smooth
  desktop flow at baseline.

## Verification

- Unit: update `pickEntryPath` test.
- Typecheck / build.
- **Live** against the real project: register a test user → confirm cookie session
  + dashboard loads → confirm a `profiles` row appears in Supabase (and the local
  mirror) → logout → login again. Confirm anon RLS still blocks (already verified).

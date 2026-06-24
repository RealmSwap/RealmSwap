# Desktop Auth Entry Route — Design

Date: 2026-06-24
Status: Approved
Scope: Make the desktop app open to the correct auth entry point instead of the marketing landing page.

## Problem

The packaged desktop app opens to `/`, the marketing landing page. A desktop app should drop the user straight into authentication: the dashboard if already logged in, the login page if an account exists, or the register page on a fresh install.

## Goal

On desktop launch, route to:
- **`/dashboard`** if a valid `gv_session` exists (and its user still exists)
- **`/login`** if no valid session but at least one user exists
- **`/register`** if no users exist yet (fresh install)

The web app's `/` marketing page is unchanged — only the desktop window is repointed.

## Design

### Entry route — `src/app/start/page.tsx`

Async server component, marked `export const dynamic = "force-dynamic"` so it is evaluated per-request (it reads cookies and the DB; never statically prerendered).

Logic:
1. `getAuthenticatedUser()` (existing, `src/lib/auth.ts`) — returns the user for a valid `gv_session` cookie, else `null` (covers no token / invalid token / expired / user-not-found).
2. If a user is returned → `redirect("/dashboard")`.
3. Else `prisma.user.count()` → `redirect(count > 0 ? "/login" : "/register")`.

Reuses existing, already-working auth code; no new auth logic. Consistent with the project constraint "auth unchanged."

### Pure decision helper — `src/lib/authEntry.ts`

```ts
export function pickEntryPath(input: { isAuthenticated: boolean; userCount: number }): "/dashboard" | "/login" | "/register"
```
- `isAuthenticated` → `/dashboard`
- else `userCount > 0` → `/login`
- else → `/register`

The page wires real data (`getAuthenticatedUser()` result, `prisma.user.count()`) into this helper, then calls `redirect()`. Keeps the branching logic unit-testable without a running server/DB.

### Electron change — `electron/main.js`

The window loads the `/start` path instead of `/`, in both production and dev:
- Production: `http://127.0.0.1:${port}/start`
- Dev (`GAMEVAULT_DEV=1`): `http://localhost:3000/start`

## Edge cases

- Invalid / expired cookie, or a token whose user was deleted → `getAuthenticatedUser()` returns `null` → falls through to the count check. Correct.
- Fresh install (template DB, zero users) → `/register`. The first registrant becomes ADMIN (existing register-route behavior).

## Testing

- **Unit (vitest):** `pickEntryPath` — three cases: authenticated → `/dashboard`; not authenticated + userCount > 0 → `/login`; userCount 0 → `/register`.
- **Manual smoke:** launch packaged app fresh (no users) → lands on `/register`; register → dashboard; quit + relaunch with valid session → lands on `/dashboard`; (optionally) log out → relaunch → lands on `/login`.

## Out of scope

- No changes to login/register/dashboard pages or auth APIs.
- No change to the web `/` landing page.

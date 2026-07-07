# Marketing site → Vercel (baseline port)

Branch: `feat/marketing-vercel` · Scope: the standalone Next.js marketing app in
[`site/`](../site) (its own `package.json`/lockfile), **not** the Electron app in `src/`.

This is a **baseline / prep** change. It gets `site/` into a clean, Vercel-deployable
state and scaffolds a no-op server surface so interactive server-side features can be
added later. **Nothing was deployed.** No `vercel` login/link/deploy was run, no live
project or domain was created. The go-live steps below are for a human to run.

## Decisions (confirmed with Jimmy)

| Fork | Decision |
| --- | --- |
| Vercel project root | **Root Directory = `site/`** — Vercel installs & builds only the marketing app; the Electron/Prisma toolchain is not pulled in. |
| Runtime model | **Server-enabled**, page stays SSG. Dropped `output: 'export'` so route handlers / server actions run on Vercel's Next runtime. The landing page itself still prerenders statically. |
| GitHub Pages | **Vercel supersedes Pages.** The Pages deploy workflow and `.nojekyll` are removed, and the `/RealmSwap` subpath config is gone. |
| Domain / analytics | **Custom domain planned** (steps below); **no analytics** scaffolded (opt-in later). |

## What changed

**Modified**
- `site/next.config.mjs` — removed `output: 'export'`, `basePath: '/RealmSwap'`,
  `assetPrefix: '/RealmSwap'`, and `images.unoptimized`. Now a minimal config
  (`reactStrictMode`) that serves at the domain root on Vercel's Next runtime.
- `site/app/page.tsx` — removed the hardcoded `ASSET_PREFIX = '/RealmSwap'` and changed
  the two logo `<img>` tags from `` `${ASSET_PREFIX}/logo.png` `` to `/logo.png`. (The
  GitHub download URLs still legitimately contain `RealmSwap/RealmSwap` — those are the
  repo path, not a basePath.)
- `site/package.json` — added `"engines": { "node": ">=18.18.0" }` (Next 14 floor).

**Added**
- `site/vercel.json` — declares `framework: nextjs` and a small set of security headers.
- `site/.env.example` — placeholder env vars (no secrets) for the future server surface.
- `site/lib/backend/supabase.ts` — the **seam** to the shared Supabase backend (no-op stub).
- `site/app/actions/index.ts` — server-action surface (`"use server"`), no-op baseline.
- `site/app/api/health/route.ts` — a `GET /api/health` route handler (dynamic).

**Removed (GitHub Pages retirement)**
- `.github/workflows/site.yml` — the Pages deploy workflow (would break without static export).
- `site/public/.nojekyll` — Pages-only artifact.

## Build & runtime verification

`cd site && npm ci && npm run build` passes. Route table:

```
Route (app)                    Size      First Load JS
┌ ○ /                          6.99 kB   94.2 kB       (Static — SSG)
├ ○ /_not-found                875 B     88.1 kB
└ ƒ /api/health                0 B       0 B           (Dynamic — server-rendered on demand)
```

`ƒ /api/health` proves the server surface is live (a dynamic route cannot exist under
`output: 'export'`). Verified against `next start` locally:
- `GET /api/health` → `{"ok":true,"service":"realmswap-site","backendConfigured":false}`
- `GET /` → HTTP 200, logo resolves to `/logo.png` (served at root, HTTP 200), no `/RealmSwap` subpath leaks.

## Vercel project structure & settings

The project maps the monorepo by pointing Vercel at the subdirectory:

| Setting | Value |
| --- | --- |
| Repository | `RealmSwap/RealmSwap` (GitHub) |
| **Root Directory** | `site` |
| Framework Preset | Next.js (auto-detected) |
| Install Command | `npm ci` (lockfile present) — or leave default |
| Build Command | `next build` (default `npm run build`) |
| Output Directory | `.next` (default; do not override) |
| Node.js Version | **22.x** (LTS; project floor is `>=18.18.0`) |

`site/vercel.json` pins the framework and adds baseline security headers; most settings
are auto-detected because Root Directory is `site`.

Optional: because only `site/**` matters to this project, you can set a Vercel **Ignored
Build Step** command so pushes that don't touch `site/` skip a build
(`git diff --quiet HEAD^ HEAD -- .` scoped to `site`). Not required.

## Environment variables

The build needs none of these. The **Featured Realms** feature (below) needs the two
**public** vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to populate —
without them the showcase simply renders its empty state and `/api/health` reports
`backendConfigured: false`. The **server-only** vars are for future privileged writes and
point at the same **shared Supabase backend** (owned by the `realmswap-supabase` effort,
branch `feat/supabase-shared-services`). Set them in Vercel → Project → Settings →
Environment Variables. Never commit real values; `.env.example` holds placeholders only, and
local dev reads a gitignored `.env.local`.

| Variable | Scope | In browser? | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | yes | Supabase URL for client reads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | yes | Supabase anon key (client) |
| `SUPABASE_URL` | Server | no | Supabase URL for route handlers / server actions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | no | Privileged server key — **never** expose to the browser |
| `NEXT_PUBLIC_SITE_URL` | Public | yes | Canonical site URL for absolute links/metadata (optional) |

## Server-surface scaffold (how it will talk to the shared backend)

The seam is deliberately a **no-op** so no real feature is implemented here:

- `lib/backend/supabase.ts` exposes `getSupabaseServerClient()` (returns `null` until the
  shared package lands and env is set) and `isBackendConfigured()`. It intentionally does
  **not** depend on `@supabase/supabase-js` yet — that dependency and the real client/schema
  are owned by `realmswap-supabase` on `feat/supabase-shared-services`.
- `app/actions/index.ts` (`"use server"`) has `subscribeToUpdates(formData)` — validates
  shape, then short-circuits to a "not configured" result via the seam. Not wired to the UI.
- `app/api/health/route.ts` — `GET /api/health`, the liveness probe / proof the runtime works.

When the shared backend is ready: install its client, replace the `getSupabaseServerClient()`
stub body with a real `createClient(...)`, fill in the action's persistence, and wire the
relevant form(s) to the server action.

## First interactive feature: Featured Realms (live from Supabase)

Branch `feat/marketing-featured-realms` (off merged `main`) wires the marketing server
surface to the **shared Supabase backend** for the first real feature — a read-only
"Featured Realms" showcase. Because `site/` is its own Next package, it uses its **own** thin
Supabase client pointed at the same project; it does not import the Electron app's
`src/lib/supabase` code, and it adds **no** tables or RLS (those are owned by
`realmswap-supabase`).

- `site/package.json` — adds `@supabase/supabase-js@^2.110.1`.
- `site/lib/backend/supabase.ts` — real `getPublicSupabaseClient()` (anon, RLS-gated, no
  session); `isBackendConfigured()` now reflects the public anon env. The service-role seam
  stays a no-op stub for future writes.
- `site/lib/backend/realms.ts` — `getFeaturedRealms()` reads public `realms`
  (`visibility='PUBLIC'`, ordered by `like_count`), maps snake_case → typed `FeaturedRealm`,
  returns `[]` on any error (never breaks the page).
- `site/app/api/realms/featured/route.ts` — `GET /api/realms/featured` → `{ realms }`
  (dynamic, edge-cached 60s). The concrete server→Supabase endpoint.
- `site/app/page.tsx` — a "Featured Realms" section (+ nav link) fetches that endpoint and
  renders cards, with a graceful "Marketplace launching soon" empty state.

Verified: `next build` green; `GET /api/realms/featured` → `{"realms":[]}` (HTTP 200) against
the live project — anon RLS read of `realms` works; the table is currently empty, so the
empty state shows until realms are published. `/api/health` → `backendConfigured:true`.

## Go-live checklist (human-run — not done here)

1. **Import project**: Vercel dashboard → Add New → Project → import `RealmSwap/RealmSwap`.
2. **Set Root Directory = `site`**; confirm Framework = Next.js.
3. **Set Node.js Version = 22.x** in Project Settings.
4. **Env vars**: the build needs none, but set `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` so **Featured Realms** populates (without them it renders
   the empty state). Add the server-only vars later for privileged writes.
5. **First deploy** → get the `*.vercel.app` URL. Smoke test: `/` loads; `/api/health`
   returns `{"ok":true,...}`; the logo renders.
6. **Custom domain**: Project → Settings → Domains → add the chosen domain (e.g.
   `realmswap.app`). Create the DNS records Vercel shows at the registrar (A/ALIAS at apex
   or CNAME for `www`); wait for verification + automatic TLS.
7. **Decommission Pages**: the workflow + `.nojekyll` are already removed on this branch.
   After merge, disable the repo's GitHub Pages environment if desired and update any links
   pointing at the old `/RealmSwap` Pages URL to the new domain.

**What Jimmy must provide**: a Vercel account with access to the `RealmSwap` GitHub org; the
chosen custom domain + registrar DNS access; and (later) the Supabase URL + anon key +
service-role key from the shared-backend effort.

## Open decisions / follow-ups

- **Domain name** not finalized (placeholder `realmswap.app`).
- **Analytics** deferred by choice — add later with `@vercel/analytics` (dependency +
  `<Analytics/>` in `app/layout.tsx`), ideally env-guarded.
- **Shared backend contract** (table names, auth model) is owned by `realmswap-supabase` /
  `feat/supabase-shared-services`; the seam here is a stub that depends on it conceptually only.
- Preview deployments per branch are automatic on Vercel — no action needed.

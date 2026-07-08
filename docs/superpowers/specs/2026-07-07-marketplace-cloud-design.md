# Spec — App Wiring Phase 3: Marketplace to Cloud (realms)

Date: 2026-07-07 · Branch: `feat/supabase-shared-services` · Builds on Phases 1–2.

## Goal

Move the template marketplace (browse / publish / deploy / vote) off the local
`MarketplaceTemplate` table onto the cloud `realms` table, with RLS. Scope is
**realms only**; `items` (smaller à-la-carte goods) are a future phase.

## Mapping

| Local | Cloud |
|---|---|
| `MarketplaceTemplate` | `realms` |
| `TemplateVote` | `realm_votes` (±1; counts via `realm_votes_sync_counts()` trigger) |
| deploy (download bump) | `acquire_realm(uuid)` RPC (ownership + transaction + download) |
| `author` (string) | derived from `seller_id` → profile name, or "RealmSwap Official" when null |

The frontend response shape is preserved exactly (the UI is untouched): `tags`
comma-string (cloud `text[]` → join), `payload`/`customDefSpec` JSON strings (cloud
`jsonb` → stringify), camelCase names (`download_count`→`downloads`, etc.),
`userVote` = LIKE/DISLIKE/null (cloud value 1/-1).

## Routes

- **List** `GET /api/marketplace` → query `realms` (RLS public-read of `PUBLISHED`)
  via supabase-js: filters (`game`/`tag`/`verifiedLevel`/`q`), sort
  (newest/likes/downloads), pagination (`range`, +1 row → `hasMore`); embed
  `seller:profiles!seller_id(display_name)` + `realm_votes(value)` (RLS scopes the
  vote to the caller). `q` is sanitized before the `or()` filter to avoid PostgREST
  filter injection.
- **Publish** `POST /api/marketplace/publish` → keep the script rejection + secret
  scrub, then insert into `realms` (seller_id = user, `status=PUBLISHED`,
  `verified_level=UNVERIFIED`, tags → array). Returns `{ id, name, strippedSecrets }`.
- **Vote** `POST /api/marketplace/[id]/vote` → LIKE/DISLIKE upsert / NONE delete on
  `realm_votes` (RLS own-vote); trigger maintains counts.
- **Deploy** `POST /api/marketplace/deploy` → fetch realm from cloud → `acquire_realm`
  RPC → local install from the cloud payload. `deployTemplate` refactored to take a
  fetched payload object (`DeployableTemplate`) instead of reading the local table;
  the download bump moved to the RPC. Phase 2 slot gate retained.

## Built-in / official content

The two existing built-in templates (Valheim, Terraria) are seeded into the cloud
as OFFICIAL realms (`seller_id NULL`, `verified_level=OFFICIAL`, published) via
`supabase/seed_realms.sql` (idempotent; run once). The old local seed scripts
become obsolete; the local `MarketplaceTemplate`/`TemplateVote` tables are left
dormant for now.

## Known gaps (app-side enforcement; future DB hardening)

- Secret-scrub and `verified_level=UNVERIFIED` are enforced in the publish route.
  A user bypassing the app (direct supabase-js insert) could publish with secrets
  or self-set `verified_level=OFFICIAL`. Recommended hardening before public
  launch: a BEFORE INSERT trigger on `realms` that forces `verified_level` for
  non-admins and rejects obvious secrets (or column-level INSERT grants).

## Verification (live, cleaned up)

Publish (secret scrubbed), list (author derivation + comma-string tags + JSON
payload + OFFICIAL filter), vote (trigger counts + userVote), deploy (acquire →
ownership `FREE` + `download_count=1` + local server) — all confirmed against the
real project, then the test realms + user were deleted. tsc clean.

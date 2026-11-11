# Marketplace verification ladder & moderation

How a realm earns trust in the RealmSwap marketplace, and what happens when a
realm is reported. This is the process behind the `verified_level` column —
the badge is deliberately NOT settable by any client (the publish guard
migration locks it to trusted server contexts), so every promotion here is a
deliberate human act with an audit trail in this repo.

## The three badges

| Badge | Meaning | Who can set it |
|---|---|---|
| `UNVERIFIED` | Fresh community publish. Deployable; every deploy runs the verified pipeline (sandbox boot test, auto-rollback). | Default on publish |
| `VERIFIED` | A RealmSwap maintainer has deployed + booted this realm on a clean machine and reviewed its payload (no suspicious overrides/URLs). | Maintainer via SQL editor (see below) |
| `OFFICIAL` | Platform-authored or curated content. Two kinds today: (a) hand-built official realms, (b) the curated starter shelf generated from provider popularity (`scripts/generate-official-realm-seed.mjs`). | Migration / SQL editor only |

**What OFFICIAL does *not* mean:** it is not a per-version boot certificate.
The boot test at deploy time is the per-install verification — that's the
product's core claim and it applies to every realm, badge or not. OFFICIAL
means "the source is curated/trusted by us", which is why the seed marks
provider packs (RLCraft, ATM10, …) OFFICIAL without us boot-testing 41 packs
by hand: their source is CurseForge/Modrinth popularity, and the deploy-time
boot test is what proves each install.

## Promoting a realm (maintainer runbook)

Both statements run in the Supabase SQL editor (service context — the only
place the guard allows a badge change):

```sql
-- After you have personally deployed + booted the realm from a clean machine:
update public.realms set verified_level = 'VERIFIED' where id = '<realm-id>';

-- Official curation (hand-built or seed regeneration):
update public.realms set verified_level = 'OFFICIAL' where id = '<realm-id>';
```

Seed runs regenerate the whole shelf idempotently (slug-guarded); promote a
seed realm by hand only when you're making a deliberate exception.

## Community verification (what every deploy proves)

Since the verified deploy pipeline (`realm-materialize`), **every** realm
install — badge or not — does:

1. resolve the pack/pins against the live provider,
2. snapshot whatever exists,
3. download + install real files through the same installers as manual mods,
4. boot the server in a sandbox and require a real successful start,
5. roll back (up to deleting the half-built server) on any failure.

A realm that deploys clean is *proven* by that boot, not by its badge. That
is why UNVERIFIED content is safe to surface.

## Realms that bring their own game definition

A realm for a game RealmSwap doesn't ship carries `custom_def_spec`: a game
definition. That is a different kind of content from mods and settings — it
names **the program the deployer's machine runs** — so it gets its own rules.
No amount of validation makes a stranger's server binary safe; what the rules
guarantee is that the deployer's decision is an informed one.

1. **The gate** (`src/lib/definitions/untrusted.ts`). A shared definition may
   install from a Steam app id or an https download on the allowlisted hosts,
   and may run one program: a file inside the server's own folder, or `java`
   with `requiresJava` (the app's bundled Java). It may not contain scripts,
   look a program up on the system `PATH` (`cmd.exe`, `powershell.exe`, …),
   reach outside the server folder, write non-config files, set environment
   variables that redirect what a process loads, or use a custom container
   image. The gate runs at publish, and again at deploy on the deployer's
   machine — the deploy-side run is the one that counts, because the cloud
   row can be written without going through the app. Only the gate's
   normalized copy is ever stored locally.
2. **Consent.** A deploy that would install a new definition stops (HTTP 409
   `CUSTOM_DEFINITION_CONSENT`) and shows where the files come from and the
   exact program and arguments that will run. Nothing is acquired or created
   until the user confirms. The badge does not skip this step: a badge is
   awarded to a realm, and a later version can carry a different definition.
3. **The floor in the database** (migration `20261110120000`). A trigger on
   `realms` and `realm_versions` refuses the dangerous shapes on every write,
   so app builds that predate the gate cannot be handed one.

Definitions that need more than the gate allows are not marketplace content.
They ship as built-ins, reviewed in a pull request.

**One-time review after applying migration `20261110120000`:** the trigger
only checks writes, so rows published before it are not re-examined. Run the
two `realm_def_spec_violation` queries in that migration's header and set
`status = 'REMOVED'` on anything hostile.

## Reporting (community)

Every authenticated user can report a realm from the marketplace detail view
(one report per realm per user; duplicates return a friendly message). Reasons:
`INAPPROPRIATE`, `MALICIOUS`, `SPAM`, `BROKEN`, `COPYRIGHT`, `OTHER`.

Reports land in `realm_reports` (migration `20261102180000`). Reporters see
only their own reports; admins see the queue via RLS (`public.is_admin()`).

## Admin review queue

- App route: `GET /api/admin/realm-reports` and
  `PATCH /api/admin/realm-reports/[id]` (status + admin note). These are
  double-gated: the app checks the LOCAL `User.role === "ADMIN"`, and the
  cloud RLS only returns/updates rows for cloud admins. **The desktop app
  never holds a service-role key** — the user session's RLS is the boundary.
- Prerequisite: the reviewing account must be admin in BOTH places (local
  Prisma `User.role = 'ADMIN'` — the first local account on a fresh DB is
  admin — and cloud `profiles.role = 'ADMIN'`, set once in the Supabase
  dashboard).
- Outcomes: `DISMISS` (no action), `REVIEWED` (looked at, no action yet),
  `ACTIONED` (acted — e.g. the realm was removed). Removing a realm that
  violates content policy is a maintainer action in the SQL editor:
  `update public.realms set status = 'REMOVED' where id = '...'` (the seller
  can no longer update a REMOVED listing's public visibility; RLS hides it).

## SLA (until this is a team)

One maintainer today: triage the open queue weekly, and immediately on any
`MALICIOUS` report. For realms of built-in games the payload is data — mods
from the providers, config files with an extension allowlist and secrets
scrubbed — so the queue is mostly about content policy. A realm that brings
its own game definition is the exception: the gate and the consent step bound
what it can do, but the program it runs is the author's. Treat a `MALICIOUS`
report on one of those as a code-safety report.

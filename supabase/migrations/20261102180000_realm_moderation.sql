-- Migration: realm moderation
-- Community reporting for marketplace realms + an admin review queue.
--
-- Reports are one-per-(realm, reporter) — a unique constraint turns double
-- submits into a friendly "already reported" instead of queue noise. The
-- admin boundary is cloud-side: `public.is_admin()` (profiles.role = 'ADMIN')
-- through RLS. The desktop app additionally gates its admin routes on the
-- LOCAL User.role, but the cloud RLS here is the real security boundary.
--
-- Promotion to VERIFIED/OFFICIAL is NOT part of this table: the publish guard
-- (20260707130000) locks verified_level to trusted contexts (service_role /
-- SQL editor / migrations) precisely so no client — admin included — can
-- badge-flip a realm. Verification happens out-of-band per
-- docs/marketplace-verification.md; REMOVAL of a bad realm is a status flip
-- (status column is client-updatable only by the seller, so admins act by
-- direct SQL/SQL editor as today).

create table public.realm_reports (
  id          uuid primary key default gen_random_uuid(),
  realm_id    uuid not null references public.realms(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('INAPPROPRIATE','MALICIOUS','SPAM','BROKEN','COPYRIGHT','OTHER')),
  details     text,
  status      text not null default 'OPEN' check (status in ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (realm_id, reporter_id)
);

create index realm_reports_queue_idx on public.realm_reports(status, created_at);
create index realm_reports_realm_idx on public.realm_reports(realm_id);

create trigger realm_reports_set_updated_at
  before update on public.realm_reports
  for each row execute function public.set_updated_at();

alter table public.realm_reports enable row level security;

create policy "realm_reports: insert own" on public.realm_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "realm_reports: read own" on public.realm_reports
  for select to authenticated
  using (reporter_id = auth.uid());

create policy "realm_reports: read all (admin)" on public.realm_reports
  for select to authenticated
  using (public.is_admin());

create policy "realm_reports: update (admin)" on public.realm_reports
  for update to authenticated
  using (public.is_admin());

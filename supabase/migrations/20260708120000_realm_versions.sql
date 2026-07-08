-- Migration: realm_versions
-- Template versioning for the marketplace. `realms` keeps its CURRENT payload
-- (so list/deploy/analytics are untouched); `realm_versions` is the full history.
-- Existing realms are backfilled as their first version.

create table public.realm_versions (
  id              uuid primary key default gen_random_uuid(),
  realm_id        uuid not null references public.realms(id) on delete cascade,
  version         text not null,
  payload         jsonb not null,
  custom_def_spec jsonb,
  changelog       text,
  created_at      timestamptz not null default now()
);

create index realm_versions_realm_idx on public.realm_versions(realm_id, created_at desc);

alter table public.realm_versions enable row level security;

-- Read a realm's versions whenever the realm itself is visible to the caller
-- (published/public, or their own, or admin).
create policy "realm_versions: read" on public.realm_versions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.realms r
      where r.id = realm_id
        and (
          (r.status = 'PUBLISHED' and r.visibility in ('PUBLIC', 'UNLISTED'))
          or r.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- A realm's seller may add versions (also how the create path writes v1).
create policy "realm_versions: insert own" on public.realm_versions
  for insert to authenticated
  with check (
    exists (select 1 from public.realms r where r.id = realm_id and r.seller_id = auth.uid())
  );

-- Backfill: every existing realm becomes its own first version.
insert into public.realm_versions (realm_id, version, payload, custom_def_spec, created_at)
select id, coalesce(nullif(version, ''), '1.0.0'), payload, custom_def_spec, created_at
from public.realms;

-- Publish a new version of a realm and sync the realm's current content. Scrubs
-- secrets so history never stores them. SECURITY DEFINER but seller-checked.
create or replace function public.publish_realm_version(
  p_realm_id uuid,
  p_version text,
  p_payload jsonb,
  p_custom_def_spec jsonb default null,
  p_changelog text default null
)
returns public.realm_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version text := coalesce(nullif(p_version, ''), '1.0.0');
  v_payload jsonb := public.scrub_realm_secrets(p_payload);
  v public.realm_versions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.realms r where r.id = p_realm_id and r.seller_id = auth.uid()) then
    raise exception 'not authorized to publish a version for this realm';
  end if;

  insert into public.realm_versions (realm_id, version, payload, custom_def_spec, changelog)
    values (p_realm_id, v_version, v_payload, p_custom_def_spec, p_changelog)
    returning * into v;

  update public.realms
    set payload = v_payload, custom_def_spec = p_custom_def_spec, version = v_version
    where id = p_realm_id;

  return v;
end;
$$;

revoke all on function public.publish_realm_version(uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.publish_realm_version(uuid, text, jsonb, jsonb, text) to authenticated;

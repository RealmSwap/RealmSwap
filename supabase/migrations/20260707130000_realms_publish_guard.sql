-- Migration: realms_publish_guard
-- DB-level hardening for the marketplace publish path (defense in depth beyond the
-- app route). Two protections, enforced regardless of how the row is written:
--   1. Badge lock: an authenticated NON-admin client cannot self-award
--      verified_level (OFFICIAL/VERIFIED). Trusted server contexts (service_role,
--      SQL editor, Edge Functions — where auth.uid() is NULL) and admins are exempt,
--      so seed_realms.sql and admin tooling keep working.
--   2. Secret scrub: obvious secrets in configOverrides content are stripped at the
--      DB, mirroring the app-side scrub. Idempotent.
--
-- Scoped to `realms` (the live, public marketplace). `items` should get the same
-- guard when that surface is wired.

-- Idempotent scrub of secrets in a realm payload's configOverrides[].content.
-- Pure/immutable: no table access.
create or replace function public.scrub_realm_secrets(p_payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_overrides jsonb := p_payload->'configOverrides';
  v_new jsonb := '[]'::jsonb;
  v_item jsonb;
  v_content text;
begin
  if jsonb_typeof(v_overrides) <> 'array' then
    return p_payload;
  end if;
  for v_item in select * from jsonb_array_elements(v_overrides) loop
    if jsonb_typeof(v_item->'content') = 'string' then
      v_content := regexp_replace(
        v_item->>'content',
        '(password|token|key|secret)[[:space:]]*[:=][[:space:]]*[^[:space:]"'']+',
        '\1=***REMOVED***',
        'gi'
      );
      v_item := jsonb_set(v_item, '{content}', to_jsonb(v_content));
    end if;
    v_new := v_new || jsonb_build_array(v_item);
  end loop;
  return jsonb_set(p_payload, '{configOverrides}', v_new);
end;
$$;

-- BEFORE INSERT/UPDATE guard on realms.
create or replace function public.realms_publish_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Badge lock. auth.uid() IS NULL => trusted server context (allowed).
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.verified_level := 'UNVERIFIED';
    else
      new.verified_level := old.verified_level; -- clients cannot change the badge
    end if;
  end if;

  -- 2. Secret scrub. Only when the payload actually changes (skips counter-only
  -- updates like like_count / download_count).
  if tg_op = 'INSERT' or new.payload is distinct from old.payload then
    new.payload := public.scrub_realm_secrets(new.payload);
  end if;

  return new;
end;
$$;

drop trigger if exists realms_publish_guard on public.realms;
create trigger realms_publish_guard
  before insert or update on public.realms
  for each row execute function public.realms_publish_guard();

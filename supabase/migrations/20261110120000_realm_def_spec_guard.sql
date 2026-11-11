-- Migration: realm_def_spec_guard
-- A realm (and each realm version) may carry custom_def_spec: a game
-- definition for a game RealmSwap doesn't ship. Deploying it makes the
-- deployer's machine RUN what it names, so its shape is a security boundary.
--
-- The desktop app vets the definition at deploy time
-- (src/lib/definitions/untrusted.ts), but that only protects people on a
-- build that has the check; older builds store the row's JSON and run it
-- as-is. Any signed-in account can write these rows directly through the API
-- without going through the app at all, so the rows themselves must not be
-- able to hold the dangerous shapes. This guard refuses, on every write:
--   * install / launch scripts,
--   * a missing install or launch block (older builds read a definition with
--     no install block as script-based),
--   * a program looked up on the system PATH (cmd.exe, powershell.exe, ...).
--     "java" together with requiresJava is the app's own bundled Java and
--     stays allowed,
--   * a program or config-file path that is absolute or climbs out with "..".
--
-- It is deliberately a coarse subset of the app's gate, which remains the
-- authority on what is deployable — this is the floor under it.
--
-- Rows written before this migration are NOT re-checked (the trigger only
-- looks at writes that change custom_def_spec). Review them once by hand:
--
--   select id, name, seller_id, public.realm_def_spec_violation(custom_def_spec) as problem
--     from public.realms
--    where public.realm_def_spec_violation(custom_def_spec) is not null;
--
--   select v.id, v.realm_id, v.version, public.realm_def_spec_violation(v.custom_def_spec) as problem
--     from public.realm_versions v
--    where public.realm_def_spec_violation(v.custom_def_spec) is not null;
--
-- and set status = 'REMOVED' on any realm whose definition is hostile.

-- Returns a human-readable reason when the spec may not be stored, or NULL
-- when it may. Pure: no table access.
create or replace function public.realm_def_spec_violation(p_spec jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_install jsonb;
  v_launch jsonb;
  v_exe text;
  v_item jsonb;
  -- Absolute (drive letter, or a leading slash/backslash — which covers UNC
  -- shares) or containing a ".." segment.
  c_unsafe_path constant text := '(^[A-Za-z]:)|(^[\\/])|((^|[\\/])\.\.([\\/]|$))';
begin
  if p_spec is null or jsonb_typeof(p_spec) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_spec) <> 'object' then
    return 'custom_def_spec must be a JSON object';
  end if;

  v_install := p_spec->'install';
  v_launch := p_spec->'launch';
  if v_install is null or jsonb_typeof(v_install) <> 'object' then
    return 'custom_def_spec.install must be an object';
  end if;
  if v_launch is null or jsonb_typeof(v_launch) <> 'object' then
    return 'custom_def_spec.launch must be an object';
  end if;

  if coalesce(v_install->'installScript', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
    return 'custom_def_spec may not contain an install script';
  end if;
  if coalesce(v_launch->'launchScript', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
    return 'custom_def_spec may not contain a launch script';
  end if;
  if not (v_install ? 'appId' or v_install ? 'url') then
    return 'custom_def_spec.install needs a Steam appId or a download url';
  end if;

  if jsonb_typeof(v_launch->'executable') is distinct from 'string' then
    return 'custom_def_spec.launch.executable must be a string';
  end if;
  v_exe := v_launch->>'executable';
  if v_exe = 'java' and coalesce(p_spec->'requiresJava' = 'true'::jsonb, false) then
    null; -- the app's bundled Java, wherever executableOnPath points
  elsif coalesce(v_launch->'executableOnPath', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb) then
    return 'custom_def_spec.launch.executable may not be looked up on the system PATH';
  elsif v_exe = '' or v_exe ~ c_unsafe_path then
    return 'custom_def_spec.launch.executable must be a relative path inside the server folder';
  end if;

  if p_spec ? 'configFiles' and jsonb_typeof(p_spec->'configFiles') <> 'null' then
    if jsonb_typeof(p_spec->'configFiles') <> 'array' then
      return 'custom_def_spec.configFiles must be an array';
    end if;
    for v_item in select * from jsonb_array_elements(p_spec->'configFiles') loop
      if jsonb_typeof(v_item->'path') is distinct from 'string'
         or v_item->>'path' = ''
         or v_item->>'path' ~ c_unsafe_path then
        return 'custom_def_spec.configFiles paths must be relative paths inside the server folder';
      end if;
    end loop;
  end if;

  return null;
end;
$$;

-- BEFORE INSERT/UPDATE guard, shared by realms and realm_versions. Only looks
-- at writes that set or change custom_def_spec, so counter updates
-- (download_count, like_count) on existing rows are never affected.
create or replace function public.realm_def_spec_guard()
returns trigger
language plpgsql
as $$
declare
  v_violation text;
begin
  if tg_op = 'INSERT' or new.custom_def_spec is distinct from old.custom_def_spec then
    v_violation := public.realm_def_spec_violation(new.custom_def_spec);
    if v_violation is not null then
      raise exception '%', v_violation using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists realm_def_spec_guard on public.realms;
create trigger realm_def_spec_guard
  before insert or update on public.realms
  for each row execute function public.realm_def_spec_guard();

drop trigger if exists realm_def_spec_guard on public.realm_versions;
create trigger realm_def_spec_guard
  before insert or update on public.realm_versions
  for each row execute function public.realm_def_spec_guard();

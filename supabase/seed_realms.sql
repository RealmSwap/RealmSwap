-- Seed the app's built-in starter templates into the cloud marketplace as OFFICIAL
-- realms (seller_id NULL, published, verified). Run once against the cloud project
-- (SQL Editor or `supabase db execute`). Idempotent — guarded by name.

insert into public.realms
  (seller_id, name, description, game_slug, tags, payload, price_cents, currency, visibility, status, verified_level)
select
  null,
  'Valheim Modded Starter (Jotunn)',
  'A solid base for Valheim modding featuring BepInEx and Jotunn library. Perfect for building custom modpacks.',
  'VALHEIM',
  array['Starter', 'Modded', 'Jotunn'],
  '{"version":"1.0.0","mods":[],"configOverrides":[],"startupParams":{}}'::jsonb,
  0, 'usd', 'PUBLIC', 'PUBLISHED', 'OFFICIAL'
where not exists (
  select 1 from public.realms where name = 'Valheim Modded Starter (Jotunn)' and seller_id is null
);

insert into public.realms
  (seller_id, name, description, game_slug, tags, payload, price_cents, currency, visibility, status, verified_level)
select
  null,
  'Vanilla Terraria - Small World',
  'A standard, vanilla Terraria server configured for a small, classic difficulty world. Great for a quick playthrough with a few friends.',
  'TERRARIA',
  array['Vanilla', 'Starter'],
  '{"version":"1.0.0","mods":[],"configOverrides":[],"startupParams":{"-world":"Worlds/world1.wld","-autocreate":"1","-difficulty":"0","-maxplayers":"8"}}'::jsonb,
  0, 'usd', 'PUBLIC', 'PUBLISHED', 'OFFICIAL'
where not exists (
  select 1 from public.realms where name = 'Vanilla Terraria - Small World' and seller_id is null
);

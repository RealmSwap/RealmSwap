-- Migration: realm_slugs_and_attribution
--
-- 1. Every realm gets a slug — its public address on the marketing site
--    (/r/<slug>). Official seed realms already carry curated slugs and are
--    left alone; community publishes started omitting the column, so this
--    backfills a slugified name plus a short md5-of-id suffix (unique per
--    realm) for everything missing one.
--
-- 2. A slug is an address: two realms can't share one. Partial unique index,
--    so the (historically allowed) slug-less rows keep working.
--
-- 3. Download attribution (site /download route): one row per click carrying
--    only the surface token, the realm slug when relevant, and the day.
--    Insert-only for the public — there is deliberately no read policy, so
--    nobody but the service role can read the counts.

do $$
declare
  r record;
  base text;
  candidate text;
begin
  for r in select id, name from public.realms where slug is null loop
    base := regexp_replace(lower(coalesce(r.name, 'realm')), '[^a-z0-9]+', '-', 'g');
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    if base = '' then
      base := 'realm';
    end if;
    base := left(base, 56);
    candidate := base || '-' || substring(md5(r.id::text) from 1 for 6);
    while exists (select 1 from public.realms where slug = candidate) loop
      candidate := base || '-' || substring(md5(candidate) from 1 for 6);
    end loop;
    update public.realms set slug = candidate where id = r.id;
  end loop;
end;
$$;

create unique index if not exists realms_slug_unique on public.realms (slug) where slug is not null;

create table if not exists public.download_clicks (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  realm_slug  text,
  day         date not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.download_clicks enable row level security;

create policy "download_clicks: anyone can count a click"
  on public.download_clicks
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT/UPDATE/DELETE policies on purpose: with RLS enabled that means
-- only the table owner / service role can ever read or change the counts.

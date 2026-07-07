-- Migration: marketplace
-- Domain B — shareable / marketplace content for RealmSwap shared services.
--
-- Per the design decision, REALMS and ITEMS are modelled as separate tables
-- (they carry genuinely different payloads: a realm is a full world/server =
-- TemplatePayload + optional GameDefinitionSpec; an item is a smaller a-la-carte
-- good like a mod, modpack, config preset, or asset). Ownership / transactions /
-- votes are therefore also per-type, giving clean FKs and simple RLS with no
-- Postgres polymorphic-FK hacks.
--
-- Baseline commerce model: FREE acquisition with full ownership + transaction
-- tracking. Price columns exist now (default 0) so paid tiers are a later flip
-- with no schema change. Free acquisition is exposed via SECURITY DEFINER RPCs
-- (acquire_realm / acquire_item); paid acquisition will run through the Stripe
-- Edge Function using service_role. Clients cannot insert ownership/transactions
-- directly.

-- ===========================================================================
-- realms  (full shareable world / server)
-- ===========================================================================
create table public.realms (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid references public.profiles(id) on delete set null, -- null = platform/official
  slug           text,
  name           text not null,
  description    text,
  game_slug      text,
  tags           text[] not null default '{}',
  payload        jsonb not null,          -- TemplatePayload { version, mods[], configOverrides[], startupParams }
  custom_def_spec jsonb,                  -- optional GameDefinitionSpec for unsupported games
  price_cents    integer not null default 0,
  currency       text not null default 'usd',
  visibility     text not null default 'PUBLIC'    check (visibility in ('PUBLIC','UNLISTED','PRIVATE')),
  status         text not null default 'DRAFT'     check (status in ('DRAFT','PUBLISHED','REMOVED')),
  verified_level text not null default 'UNVERIFIED' check (verified_level in ('UNVERIFIED','VERIFIED','OFFICIAL')),
  download_count integer not null default 0,
  like_count     integer not null default 0,
  dislike_count  integer not null default 0,
  version        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index realms_browse_idx  on public.realms(status, visibility);
create index realms_game_idx    on public.realms(game_slug);
create index realms_seller_idx  on public.realms(seller_id);

create trigger realms_set_updated_at
  before update on public.realms
  for each row execute function public.set_updated_at();

alter table public.realms enable row level security;

-- RLS is the hard security boundary (never DRAFT/REMOVED/PRIVATE to others).
-- Whether an UNLISTED realm shows up in browse is an app-level filter concern.
create policy "realms: read published" on public.realms
  for select to anon, authenticated
  using (status = 'PUBLISHED' and visibility in ('PUBLIC','UNLISTED'));
create policy "realms: read own" on public.realms
  for select to authenticated
  using (seller_id = auth.uid());
create policy "realms: read all (admin)" on public.realms
  for select to authenticated
  using (public.is_admin());
create policy "realms: insert own" on public.realms
  for insert to authenticated
  with check (seller_id = auth.uid());
create policy "realms: update own" on public.realms
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());
create policy "realms: delete own" on public.realms
  for delete to authenticated
  using (seller_id = auth.uid());

-- Sellers may edit content but NOT self-award verification or tamper with the
-- denormalized counters. Those are set by admin tooling / triggers respectively.
revoke update on public.realms from authenticated, anon;
grant update (slug, name, description, game_slug, tags, payload, custom_def_spec,
              price_cents, currency, visibility, status, version)
  on public.realms to authenticated;

-- ===========================================================================
-- items  (smaller a-la-carte marketplace good)
-- ===========================================================================
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid references public.profiles(id) on delete set null,
  slug           text,
  name           text not null,
  description    text,
  game_slug      text,
  item_type      text not null default 'OTHER' check (item_type in ('MOD','MODPACK','CONFIG_PRESET','ASSET','OTHER')),
  tags           text[] not null default '{}',
  payload        jsonb not null,          -- item-specific payload (single mod / preset / asset descriptor)
  price_cents    integer not null default 0,
  currency       text not null default 'usd',
  visibility     text not null default 'PUBLIC'    check (visibility in ('PUBLIC','UNLISTED','PRIVATE')),
  status         text not null default 'DRAFT'     check (status in ('DRAFT','PUBLISHED','REMOVED')),
  verified_level text not null default 'UNVERIFIED' check (verified_level in ('UNVERIFIED','VERIFIED','OFFICIAL')),
  download_count integer not null default 0,
  like_count     integer not null default 0,
  dislike_count  integer not null default 0,
  version        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index items_browse_idx on public.items(status, visibility);
create index items_game_idx   on public.items(game_slug);
create index items_seller_idx on public.items(seller_id);
create index items_type_idx   on public.items(item_type);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

alter table public.items enable row level security;

create policy "items: read published" on public.items
  for select to anon, authenticated
  using (status = 'PUBLISHED' and visibility in ('PUBLIC','UNLISTED'));
create policy "items: read own" on public.items
  for select to authenticated
  using (seller_id = auth.uid());
create policy "items: read all (admin)" on public.items
  for select to authenticated
  using (public.is_admin());
create policy "items: insert own" on public.items
  for insert to authenticated
  with check (seller_id = auth.uid());
create policy "items: update own" on public.items
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());
create policy "items: delete own" on public.items
  for delete to authenticated
  using (seller_id = auth.uid());

revoke update on public.items from authenticated, anon;
grant update (slug, name, description, game_slug, item_type, tags, payload,
              price_cents, currency, visibility, status, version)
  on public.items to authenticated;

-- ===========================================================================
-- ownership  (per-type; who has acquired what)
-- ===========================================================================
create table public.realm_ownership (
  id             uuid primary key default gen_random_uuid(),
  realm_id       uuid not null references public.realms(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  acquired_via   text not null default 'FREE' check (acquired_via in ('FREE','PURCHASE','GRANT','AUTHOR')),
  transaction_id uuid,
  created_at     timestamptz not null default now(),
  unique (realm_id, owner_id)
);
create index realm_ownership_owner_idx on public.realm_ownership(owner_id);

create table public.item_ownership (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.items(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  acquired_via   text not null default 'FREE' check (acquired_via in ('FREE','PURCHASE','GRANT','AUTHOR')),
  transaction_id uuid,
  created_at     timestamptz not null default now(),
  unique (item_id, owner_id)
);
create index item_ownership_owner_idx on public.item_ownership(owner_id);

alter table public.realm_ownership enable row level security;
alter table public.item_ownership  enable row level security;

-- Owners read their own library; admins see all. Inserts happen only through the
-- acquire_* RPCs / service_role, so there is intentionally no client INSERT policy.
create policy "realm_ownership: read own" on public.realm_ownership
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
create policy "item_ownership: read own" on public.item_ownership
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- transactions  (per-type; record of every acquisition, free or paid)
-- ===========================================================================
create table public.realm_transactions (
  id                       uuid primary key default gen_random_uuid(),
  realm_id                 uuid not null references public.realms(id) on delete cascade,
  buyer_id                 uuid not null references public.profiles(id) on delete cascade,
  seller_id                uuid references public.profiles(id) on delete set null,
  amount_cents             integer not null default 0,
  currency                 text not null default 'usd',
  type                     text not null default 'FREE_ACQUISITION' check (type in ('FREE_ACQUISITION','PURCHASE')),
  status                   text not null default 'COMPLETED' check (status in ('PENDING','COMPLETED','REFUNDED','FAILED')),
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now()
);
create index realm_tx_buyer_idx  on public.realm_transactions(buyer_id);
create index realm_tx_seller_idx on public.realm_transactions(seller_id);

create table public.item_transactions (
  id                       uuid primary key default gen_random_uuid(),
  item_id                  uuid not null references public.items(id) on delete cascade,
  buyer_id                 uuid not null references public.profiles(id) on delete cascade,
  seller_id                uuid references public.profiles(id) on delete set null,
  amount_cents             integer not null default 0,
  currency                 text not null default 'usd',
  type                     text not null default 'FREE_ACQUISITION' check (type in ('FREE_ACQUISITION','PURCHASE')),
  status                   text not null default 'COMPLETED' check (status in ('PENDING','COMPLETED','REFUNDED','FAILED')),
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now()
);
create index item_tx_buyer_idx  on public.item_transactions(buyer_id);
create index item_tx_seller_idx on public.item_transactions(seller_id);

alter table public.realm_transactions enable row level security;
alter table public.item_transactions  enable row level security;

-- Buyers see their purchases; sellers see their sales; admins see all.
-- Inserts happen only through the acquire_* RPCs / service_role.
create policy "realm_tx: read own" on public.realm_transactions
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
create policy "item_tx: read own" on public.item_transactions
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- votes  (per-type; LIKE = +1, DISLIKE = -1; counts denormalized on the parent)
-- ===========================================================================
create table public.realm_votes (
  id         uuid primary key default gen_random_uuid(),
  realm_id   uuid not null references public.realms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (realm_id, user_id)
);

create table public.item_votes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, user_id)
);

alter table public.realm_votes enable row level security;
alter table public.item_votes  enable row level security;

create trigger realm_votes_set_updated_at
  before update on public.realm_votes
  for each row execute function public.set_updated_at();
create trigger item_votes_set_updated_at
  before update on public.item_votes
  for each row execute function public.set_updated_at();

-- A user fully controls their own vote.
create policy "realm_votes: read own" on public.realm_votes
  for select to authenticated using (user_id = auth.uid());
create policy "realm_votes: write own" on public.realm_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "item_votes: read own" on public.item_votes
  for select to authenticated using (user_id = auth.uid());
create policy "item_votes: write own" on public.item_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Recompute denormalized like/dislike counts on the parent whenever a vote
-- changes. SECURITY DEFINER so it can update the counter columns that clients
-- are not granted direct UPDATE on.
create or replace function public.realm_votes_sync_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  rid := coalesce(new.realm_id, old.realm_id);
  update public.realms r set
    like_count    = (select count(*) from public.realm_votes v where v.realm_id = rid and v.value =  1),
    dislike_count = (select count(*) from public.realm_votes v where v.realm_id = rid and v.value = -1)
  where r.id = rid;
  return coalesce(new, old);
end; $$;

create trigger realm_votes_counts
  after insert or update or delete on public.realm_votes
  for each row execute function public.realm_votes_sync_counts();

create or replace function public.item_votes_sync_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  iid := coalesce(new.item_id, old.item_id);
  update public.items i set
    like_count    = (select count(*) from public.item_votes v where v.item_id = iid and v.value =  1),
    dislike_count = (select count(*) from public.item_votes v where v.item_id = iid and v.value = -1)
  where i.id = iid;
  return coalesce(new, old);
end; $$;

create trigger item_votes_counts
  after insert or update or delete on public.item_votes
  for each row execute function public.item_votes_sync_counts();

-- ===========================================================================
-- Acquisition RPCs  (free path; paid path will run via the Stripe Edge Function)
-- ===========================================================================
-- Atomically record a FREE acquisition: writes a transaction + ownership row and
-- bumps download_count. Idempotent per (realm, user). Rejects paid listings so
-- money always flows through Stripe. SECURITY DEFINER, owned by the migration
-- role, so it can write the client-locked ownership/transactions/counter columns.
create or replace function public.acquire_realm(p_realm_id uuid)
returns public.realm_ownership
language plpgsql
security definer
set search_path = public
as $$
declare
  v_realm public.realms;
  v_uid   uuid := auth.uid();
  v_tx_id uuid;
  v_own   public.realm_ownership;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_realm from public.realms where id = p_realm_id;
  if not found then
    raise exception 'realm not found';
  end if;
  if v_realm.status <> 'PUBLISHED' then
    raise exception 'realm is not published';
  end if;
  if v_realm.price_cents > 0 then
    raise exception 'realm is not free; use the paid checkout flow';
  end if;

  -- Already owned? return existing ownership (idempotent).
  select * into v_own from public.realm_ownership
    where realm_id = p_realm_id and owner_id = v_uid;
  if found then
    return v_own;
  end if;

  insert into public.realm_transactions (realm_id, buyer_id, seller_id, amount_cents, type, status)
    values (p_realm_id, v_uid, v_realm.seller_id, 0, 'FREE_ACQUISITION', 'COMPLETED')
    returning id into v_tx_id;

  insert into public.realm_ownership (realm_id, owner_id, acquired_via, transaction_id)
    values (p_realm_id, v_uid, 'FREE', v_tx_id)
    returning * into v_own;

  update public.realms set download_count = download_count + 1 where id = p_realm_id;

  return v_own;
end;
$$;

create or replace function public.acquire_item(p_item_id uuid)
returns public.item_ownership
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item  public.items;
  v_uid   uuid := auth.uid();
  v_tx_id uuid;
  v_own   public.item_ownership;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then
    raise exception 'item not found';
  end if;
  if v_item.status <> 'PUBLISHED' then
    raise exception 'item is not published';
  end if;
  if v_item.price_cents > 0 then
    raise exception 'item is not free; use the paid checkout flow';
  end if;

  select * into v_own from public.item_ownership
    where item_id = p_item_id and owner_id = v_uid;
  if found then
    return v_own;
  end if;

  insert into public.item_transactions (item_id, buyer_id, seller_id, amount_cents, type, status)
    values (p_item_id, v_uid, v_item.seller_id, 0, 'FREE_ACQUISITION', 'COMPLETED')
    returning id into v_tx_id;

  insert into public.item_ownership (item_id, owner_id, acquired_via, transaction_id)
    values (p_item_id, v_uid, 'FREE', v_tx_id)
    returning * into v_own;

  update public.items set download_count = download_count + 1 where id = p_item_id;

  return v_own;
end;
$$;

revoke all on function public.acquire_realm(uuid) from public, anon;
revoke all on function public.acquire_item(uuid)  from public, anon;
grant execute on function public.acquire_realm(uuid) to authenticated;
grant execute on function public.acquire_item(uuid)  to authenticated;

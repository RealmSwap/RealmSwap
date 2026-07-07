-- Migration: init_shared_services
-- Domain A — paid-user identity, billing, and entitlement for RealmSwap shared services.
--
-- This SQL is the SOURCE OF TRUTH for the cloud DB schema + Row Level Security.
-- Apply with `supabase db push` against a fresh Supabase Postgres project.
-- The Prisma cloud schema (prisma/cloud/schema.prisma) is kept in sync FROM this
-- via `prisma db pull` and is used only for typed tooling, never shipped with secrets.
--
-- Security model reminder: the Next.js "server" is embedded in the Electron desktop
-- app and runs on the END USER's machine. It therefore NEVER holds the service_role
-- key or a direct Postgres connection. All client access is anon-key + user JWT, and
-- RLS is the real access boundary. Trusted writes (billing) happen only in Supabase
-- Edge Functions using service_role (which bypasses RLS by design).

-- ===========================================================================
-- Helpers
-- ===========================================================================

-- Generic updated_at maintainer.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- (is_admin() is defined after public.profiles below, since a `language sql`
--  function body is validated against referenced tables at creation time.)

-- ===========================================================================
-- profiles  (1:1 with auth.users)
-- ===========================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  discord_id    text unique,
  role          text not null default 'USER' check (role in ('USER','ADMIN')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Any authenticated user may read profiles' public identity (needed to render
-- seller/author names in the marketplace). Narrow to `id = auth.uid()` if you
-- would rather keep profiles fully private.
create policy "profiles: read" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- No INSERT/DELETE policy: rows are created by the signup trigger below and
-- removed via auth.users cascade. service_role bypasses RLS for admin ops.

-- Users may not self-promote to ADMIN. Lock the role column down; role changes
-- happen via service_role / admin tooling only.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, discord_id) on public.profiles to authenticated;

-- Create a profile row automatically when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, discord_id)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    -- Discord OAuth surfaces the numeric Discord user id as provider_id.
    case
      when new.raw_app_meta_data->>'provider' = 'discord'
        then new.raw_user_meta_data->>'provider_id'
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current JWT an app admin? Reads public.profiles.role.
-- SECURITY DEFINER so it can read profiles regardless of the caller's own RLS.
-- Defined here (after public.profiles) because a `language sql` body is checked
-- against referenced tables at creation time.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN'
  );
$$;

-- ===========================================================================
-- customers  (profile -> Stripe customer)
-- ===========================================================================
create table public.customers (
  id                 uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy "customers: read own" on public.customers
  for select to authenticated
  using (id = auth.uid());
-- Writes: service_role only (Stripe webhook Edge Function). No client policies.

-- ===========================================================================
-- products / prices  (mirror of the Stripe catalogue)
-- ===========================================================================
create table public.products (
  id          text primary key,           -- Stripe product id (prod_...)
  active      boolean not null default true,
  name        text,
  description text,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.prices (
  id             text primary key,         -- Stripe price id (price_...)
  product_id     text references public.products(id) on delete cascade,
  active         boolean not null default true,
  currency       text not null default 'usd',
  unit_amount    integer,                  -- smallest currency unit (cents)
  interval       text check (interval in ('day','week','month','year')),
  interval_count integer default 1,
  -- Which RealmSwap plan this price grants, and how many active slots it unlocks.
  plan           text check (plan in ('STARTER','PARTY','GUILD')),
  active_slots   integer,
  metadata       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.prices   enable row level security;

create policy "products: read active" on public.products
  for select to anon, authenticated
  using (active = true);

create policy "prices: read active" on public.prices
  for select to anon, authenticated
  using (active = true);
-- Writes: service_role only (webhook syncs the catalogue from Stripe).

-- ===========================================================================
-- subscriptions  (Stripe subscription state = entitlement source of truth)
-- ===========================================================================
create table public.subscriptions (
  id                   text primary key,   -- Stripe subscription id (sub_...)
  user_id              uuid not null references public.profiles(id) on delete cascade,
  status               text not null,      -- trialing|active|past_due|canceled|incomplete|...
  price_id             text references public.prices(id),
  plan                 text check (plan in ('STARTER','PARTY','GUILD')),
  active_slots         integer not null default 1,
  quantity             integer not null default 1,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());
-- Writes: service_role only (Stripe webhook). Never trust the client for billing.

-- ===========================================================================
-- stripe_events  (webhook idempotency log)
-- ===========================================================================
create table public.stripe_events (
  id           text primary key,           -- Stripe event id (evt_...)
  type         text,
  processed_at timestamptz not null default now(),
  payload      jsonb
);

alter table public.stripe_events enable row level security;
-- No policies: only service_role (which bypasses RLS) reads/writes this table.

-- ===========================================================================
-- user_entitlements  (single read surface: "what has this user paid for?")
-- ===========================================================================
-- One row per user with an active/trialing subscription, choosing the most
-- privileged (highest active_slots). Users with no active subscription simply
-- do not appear -> the app treats absence as the free tier.
create or replace view public.user_entitlements
with (security_invoker = true) as
select distinct on (s.user_id)
  s.user_id,
  s.plan,
  s.active_slots,
  s.status,
  s.current_period_end,
  true as is_active
from public.subscriptions s
where s.status in ('active', 'trialing')
order by s.user_id, s.active_slots desc nulls last, s.current_period_end desc nulls last;

grant select on public.user_entitlements to authenticated;

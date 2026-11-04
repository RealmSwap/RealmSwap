-- Hosted status page backend (realmswap.app/s/<code>).
--
-- One row per server the host explicitly published via "Share status" in the
-- dashboard. The code is the capability: anyone holding it can read the row
-- (anon SELECT), and only the publishing owner's session can create or update
-- it (RLS on auth.uid() — the local app pushes with the host's own access
-- token, so no elevated key ever ships inside the app).
--
-- Deliberately leak-proof, mirroring the host-local /s/<code> contract in
-- src/lib/statusShare.ts: name, game, up/down state and player COUNTS only.
-- Never addresses, passwords, host identity, or player names.

create table if not exists public.public_status (
  code        text primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  game        text not null,
  status      text not null,
  players     int,
  maxplayers  int,
  updated_at  timestamptz not null default now()
);

alter table public.public_status enable row level security;

create policy "anyone with the code can read a published status"
  on public.public_status
  for select
  to anon, authenticated
  using (true);

create policy "owner can publish their own server status"
  on public.public_status
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "owner can refresh their own server status"
  on public.public_status
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner can unpublish their own server status"
  on public.public_status
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- The status reader only ever needs the newest snapshot per code.
create index if not exists public_status_owner_idx
  on public.public_status (owner_id);

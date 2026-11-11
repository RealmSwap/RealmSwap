-- Migration: usage_snapshots
--
-- Strictly opt-in product telemetry: one anonymous row per install per UTC
-- day, written only when the host's ADMIN turned "Share anonymous usage
-- milestones" on in Settings. The row answers the funnel questions the
-- product can't see otherwise (do deployed servers ever get a friend online?
-- which games matter? do installs come back in week 2?) without carrying
-- anything identifying: no account id, no server names, no addresses, no
-- player counts, no IP — `install_id` is a random UUID generated at opt-in
-- and regenerated whenever the feature is switched off and back on.
--
-- Insert-only for the public (a duplicate day is simply refused by the
-- primary key and swallowed by the sender); there is deliberately no
-- SELECT/UPDATE/DELETE policy, so only the service role can read the counts.

create table if not exists public.usage_snapshots (
  install_id      uuid not null,
  day             date not null,
  app_version     text,
  platform        text,
  servers         int,
  games           text[] not null default '{}',
  deployed        boolean not null default false,
  first_online    boolean not null default false,
  mods            boolean not null default false,
  invite          boolean not null default false,
  friend_joined   boolean not null default false,
  status_share    boolean not null default false,
  session_planned boolean not null default false,
  remote_host     boolean not null default false,
  active          boolean not null default false,
  primary key (install_id, day)
);

alter table public.usage_snapshots enable row level security;

create policy "usage_snapshots: anyone can submit their own day"
  on public.usage_snapshots
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT/UPDATE/DELETE policies on purpose.

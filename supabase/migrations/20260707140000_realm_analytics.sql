-- Migration: realm_analytics
-- Download analytics for the community marketplace, derived from the existing
-- realm_transactions log (every acquisition = one row with buyer + timestamp).
-- No new event logging needed.
--
-- get_my_realm_analytics() returns the caller's published/draft realms, each with
-- total downloads, downloads in the last N days, and a daily time series. Powers
-- the "My Realms" creator page in a single round-trip. SECURITY DEFINER but scoped
-- to seller_id = auth.uid(), so a user only ever sees their own realms.

create or replace function public.get_my_realm_analytics(p_days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v json;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json)
  into v
  from (
    select
      r.id,
      r.name,
      r.game_slug,
      r.status,
      r.visibility,
      r.verified_level,
      r.download_count as total_downloads,
      r.like_count,
      r.dislike_count,
      r.created_at,
      (
        select count(*)
        from public.realm_transactions t
        where t.realm_id = r.id
          and t.created_at >= now() - make_interval(days => p_days)
      ) as downloads_in_window,
      (
        select coalesce(json_agg(json_build_object('day', d.day, 'downloads', d.c) order by d.day), '[]'::json)
        from (
          select date_trunc('day', t.created_at)::date as day, count(*)::int as c
          from public.realm_transactions t
          where t.realm_id = r.id
            and t.created_at >= now() - make_interval(days => p_days)
          group by 1
        ) d
      ) as daily
    from public.realms r
    where r.seller_id = auth.uid()
  ) x;

  return v;
end;
$$;

revoke all on function public.get_my_realm_analytics(int) from public, anon;
grant execute on function public.get_my_realm_analytics(int) to authenticated;

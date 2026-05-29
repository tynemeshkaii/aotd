-- Daily pick scheduling hardening:
-- - tolerate stale/invalid profile timezones by falling back to UTC
-- - let dispatch catch up later the same local day if the hourly cron missed
--   the exact pre-push window
-- - keep client "today" resolution on the same safe timezone helper

grant select, update on public.profiles to authenticated;

create or replace function public.safe_profile_timezone(p_timezone text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  candidate text := nullif(trim(p_timezone), '');
begin
  if candidate is null then
    return 'UTC';
  end if;

  perform now() at time zone candidate;
  return candidate;
exception
  when others then
    return 'UTC';
end;
$$;

revoke all on function public.safe_profile_timezone(text) from public;
grant execute on function public.safe_profile_timezone(text) to authenticated, service_role;

drop function if exists public.find_users_due_for_compute(int);

create or replace function public.find_users_due_for_compute(
  p_lead_minutes int default 60,
  p_catchup_minutes int default 720
)
returns table (
  user_id uuid,
  target_date date,
  user_tz text,
  push_time time
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cands as (
    select
      p.id as user_id,
      public.safe_profile_timezone(p.timezone) as tz,
      coalesce(p.preferred_push_time, '08:00'::time) as push_t
    from public.profiles p
    where exists (
      select 1 from public.streaming_connections sc
      where sc.user_id = p.id and sc.provider = 'spotify'
    )
    and exists (
      select 1 from public.library_sync_status lss
      where lss.user_id = p.id and lss.aggregated_albums_count is not null
    )
  ),
  local_clock as (
    select
      c.user_id,
      c.tz,
      c.push_t,
      (now() at time zone c.tz)::timestamp as local_now
    from cands c
  ),
  pushes as (
    select
      lc.user_id,
      lc.tz,
      lc.push_t,
      lc.local_now,
      (lc.local_now::date + lc.push_t)::timestamp as today_push,
      ((lc.local_now::date + interval '1 day')::date + lc.push_t)::timestamp as tomorrow_push,
      (greatest(p_lead_minutes, 0) || ' minutes')::interval as lead_window,
      (greatest(p_catchup_minutes, 0) || ' minutes')::interval as catchup_window
    from local_clock lc
  ),
  windowed as (
    select
      p.user_id,
      p.tz,
      p.push_t,
      case
        when p.today_push between p.local_now and p.local_now + p.lead_window
          then p.today_push::date
        when p.tomorrow_push between p.local_now and p.local_now + p.lead_window
          then p.tomorrow_push::date
        when p.local_now >= p.today_push
         and p.local_now < p.today_push + p.catchup_window
          then p.today_push::date
        else null
      end as resolved_target_date
    from pushes p
  )
  select
    w.user_id,
    w.resolved_target_date,
    w.tz,
    w.push_t
  from windowed w
  where w.resolved_target_date is not null
    and not exists (
      select 1 from public.albums_of_the_day aotd
      where aotd.user_id = w.user_id and aotd.date = w.resolved_target_date
    );
end;
$$;

revoke all on function public.find_users_due_for_compute(int, int) from public;
grant execute on function public.find_users_due_for_compute(int, int) to service_role;

create or replace function public.get_current_pick(p_user_id uuid)
returns table (
  aotd_id uuid,
  pick_date date,
  status text,
  is_fallback boolean,
  fallback_reason text,
  selection_reason jsonb,
  opened_at timestamptz,
  album_id uuid,
  album_title text,
  album_primary_artist_name text,
  album_cover_url text,
  album_spotify_id text,
  album_release_year int,
  album_total_tracks int,
  album_duration_ms int,
  rating_id uuid,
  rating_score int,
  rating_comment text,
  rating_created_at timestamptz,
  rating_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tz text;
  today_local date;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  select public.safe_profile_timezone(p.timezone) into user_tz
  from public.profiles p where p.id = p_user_id;

  today_local := (now() at time zone coalesce(user_tz, 'UTC'))::date;

  return query
  select *
  from public.discovery_album_rows(p_user_id) d
  where d.pick_date = today_local
  limit 1;
end;
$$;

revoke all on function public.get_current_pick(uuid) from public;
grant execute on function public.get_current_pick(uuid) to authenticated;

create or replace function public.resolve_user_compute_context(p_user_id uuid)
returns table (
  target_date date,
  user_tz text,
  push_time time
)
language sql
security definer
set search_path = public
as $$
  select
    (now() at time zone public.safe_profile_timezone(p.timezone))::date as target_date,
    public.safe_profile_timezone(p.timezone) as user_tz,
    coalesce(p.preferred_push_time, '08:00'::time) as push_time
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.resolve_user_compute_context(uuid) from public;
grant execute on function public.resolve_user_compute_context(uuid) to service_role;

-- Phase 4 RPCs:
-- 1) find_users_due_for_compute
-- 2) ensure_recommendation_atomic
-- 3) get_current_pick
-- 4) resolve_user_compute_context

-- ===========================================================================
-- 1) find_users_due_for_compute
-- ===========================================================================
create or replace function public.find_users_due_for_compute(p_lead_minutes int default 60)
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
      coalesce(p.timezone, 'UTC') as tz,
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
      ((lc.local_now::date + interval '1 day')::date + lc.push_t)::timestamp as tomorrow_push
    from local_clock lc
  ),
  windowed as (
    select
      p.user_id,
      p.tz,
      p.push_t,
      case
        when p.today_push between p.local_now
                              and p.local_now + (p_lead_minutes || ' minutes')::interval
          then p.today_push::date
        when p.tomorrow_push between p.local_now
                                 and p.local_now + (p_lead_minutes || ' minutes')::interval
          then p.tomorrow_push::date
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

revoke all on function public.find_users_due_for_compute(int) from public;
grant execute on function public.find_users_due_for_compute(int) to service_role;

-- ===========================================================================
-- 2) ensure_recommendation_atomic
-- ===========================================================================
create or replace function public.ensure_recommendation_atomic(
  p_user_id uuid,
  p_album_id uuid,
  p_date date,
  p_algorithm_version int,
  p_selection_reason jsonb,
  p_is_fallback boolean,
  p_fallback_reason text,
  p_user_timezone text
)
returns table (created boolean, aotd_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  select id into existing_id from public.albums_of_the_day
    where user_id = p_user_id and date = p_date;

  if existing_id is not null then
    return query select false, existing_id;
    return;
  end if;

  insert into public.albums_of_the_day (
    user_id, date, album_id, algorithm_version, selection_reason,
    is_fallback, fallback_reason, user_timezone_at_compute
  ) values (
    p_user_id, p_date, p_album_id, p_algorithm_version, p_selection_reason,
    p_is_fallback, p_fallback_reason, p_user_timezone
  )
  returning id into new_id;

  insert into public.recommendation_history (user_id, album_id)
    values (p_user_id, p_album_id)
    on conflict (user_id, album_id) do nothing;

  return query select true, new_id;
end;
$$;

revoke all on function public.ensure_recommendation_atomic(uuid, uuid, date, int, jsonb, boolean, text, text) from public;
grant execute on function public.ensure_recommendation_atomic(uuid, uuid, date, int, jsonb, boolean, text, text) to service_role;

-- ===========================================================================
-- 3) get_current_pick
-- ===========================================================================
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
  album_duration_ms int
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

  select coalesce(p.timezone, 'UTC') into user_tz
  from public.profiles p where p.id = p_user_id;

  today_local := (now() at time zone coalesce(user_tz, 'UTC'))::date;

  return query
  select
    aotd.id,
    aotd.date,
    aotd.status,
    aotd.is_fallback,
    aotd.fallback_reason,
    aotd.selection_reason,
    aotd.opened_at,
    a.id,
    a.title,
    a.primary_artist_name,
    a.cover_url,
    a.spotify_id,
    a.release_year,
    a.total_tracks,
    a.duration_ms
  from public.albums_of_the_day aotd
  join public.albums a on a.id = aotd.album_id
  where aotd.user_id = p_user_id
    and aotd.date = today_local
  limit 1;
end;
$$;

revoke all on function public.get_current_pick(uuid) from public;
grant execute on function public.get_current_pick(uuid) to authenticated;

-- ===========================================================================
-- 4) resolve_user_compute_context
-- ===========================================================================
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
    (now() at time zone coalesce(p.timezone, 'UTC'))::date as target_date,
    coalesce(p.timezone, 'UTC') as user_tz,
    coalesce(p.preferred_push_time, '08:00'::time) as push_time
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.resolve_user_compute_context(uuid) from public;
grant execute on function public.resolve_user_compute_context(uuid) to service_role;

-- Day-1 onboarding pick remediation: dispatcher date guard and diagnostic views.
--
-- Phase 1: Diagnostic views for day-1 fallback observability.
-- Phase 2: Hardened find_users_due_for_compute so today-missing beats tomorrow precompute,
--          and a grace window protects brand-new users from rapid double picks.

-- =========================================================================
-- Phase 1 — Diagnostic views
-- =========================================================================

-- View for day-1 pick quality: joins first-ever pick for each user with
-- library stats so QA can spot timeout fallbacks on first login.
create or replace view public.v_day1_pick_diagnostics as
with first_pick as (
  select distinct on (aotd.user_id)
    aotd.user_id,
    aotd.date,
    aotd.created_at,
    aotd.user_timezone_at_compute,
    aotd.is_fallback,
    aotd.fallback_reason,
    aotd.selection_reason,
    a.title as album_title,
    a.primary_artist_name,
    a.spotify_id
  from public.albums_of_the_day aotd
  join public.albums a on a.id = aotd.album_id
  order by aotd.user_id, aotd.date
),
library_stats as (
  select
    user_id,
    aggregated_albums_count,
    completed_at
  from public.library_sync_status
),
profile_tz as (
  select id, timezone
  from public.profiles
)
select
  fp.user_id,
  fp.date as first_pick_date,
  fp.created_at as first_pick_created_at,
  fp.user_timezone_at_compute,
  fp.is_fallback,
  fp.fallback_reason,
  fp.selection_reason,
  fp.album_title,
  fp.primary_artist_name,
  ls.aggregated_albums_count as library_albums_count,
  ls.completed_at as library_sync_completed_at,
  case
    when fp.user_timezone_at_compute = 'UTC'
     and pt.timezone is not null
     and pt.timezone <> 'UTC'
    then true
    else false
  end as tz_mismatch_flag,
  pt.timezone as current_profile_timezone
from first_pick fp
left join library_stats ls on ls.user_id = fp.user_id
left join profile_tz pt on pt.id = fp.user_id;

-- View: users who received two picks within a short window around first login.
-- Flags cases where dispatch raced onboarding.
create or replace view public.v_rapid_double_pick as
with ordered as (
  select
    user_id,
    date,
    created_at,
    is_fallback,
    fallback_reason,
    row_number() over (partition by user_id order by date) as pick_seq
  from public.albums_of_the_day
),
pairs as (
  select
    a.user_id,
    a.date as first_date,
    a.created_at as first_created,
    a.is_fallback as first_fallback,
    a.fallback_reason as first_fallback_reason,
    b.date as second_date,
    b.created_at as second_created,
    b.is_fallback as second_fallback
  from ordered a
  join ordered b
    on b.user_id = a.user_id
   and b.pick_seq = a.pick_seq + 1
  where a.pick_seq = 1
)
select
  user_id,
  first_date,
  first_created,
  second_date,
  second_created,
  extract(epoch from (second_created - first_created)) as seconds_between,
  first_fallback,
  first_fallback_reason,
  second_fallback
from pairs
where second_created - first_created < interval '10 minutes';

-- View: picks created in the last hour before local midnight.
-- These are vulnerable to date-edge races.
create or replace view public.v_late_night_picks as
select
  aotd.user_id,
  aotd.date,
  aotd.created_at,
  aotd.user_timezone_at_compute,
  (aotd.created_at at time zone coalesce(
    nullif(trim(aotd.user_timezone_at_compute), ''), 'UTC'
  ))::time as local_creation_time,
  (date_trunc('day', aotd.created_at at time zone coalesce(
    nullif(trim(aotd.user_timezone_at_compute), ''), 'UTC'
  )) + interval '1 day')::time as local_midnight_edge,
  aotd.is_fallback,
  aotd.fallback_reason
from public.albums_of_the_day aotd
where (aotd.created_at at time zone coalesce(
  nullif(trim(aotd.user_timezone_at_compute), ''), 'UTC'
))::time >= '23:00'::time;

-- Security: service-role only. These views inspect operational data including
-- fallback reasons and timezone patterns.
revoke all on public.v_day1_pick_diagnostics from anon, authenticated;
grant select on public.v_day1_pick_diagnostics to service_role;

revoke all on public.v_rapid_double_pick from anon, authenticated;
grant select on public.v_rapid_double_pick to service_role;

revoke all on public.v_late_night_picks from anon, authenticated;
grant select on public.v_late_night_picks to service_role;

-- =========================================================================
-- Phase 2 — Hardened find_users_due_for_compute
-- =========================================================================

drop function if exists public.find_users_due_for_compute(int, int);

create or replace function public.find_users_due_for_compute(
  p_lead_minutes int default 60,
  p_catchup_minutes int default 1440,
  p_first_pick_grace_minutes int default 60
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
declare
  grace_interval interval;
begin
  grace_interval := (greatest(p_first_pick_grace_minutes, 0) || ' minutes')::interval;

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
  today_status as (
    select
      lc.user_id,
      lc.tz,
      lc.push_t,
      lc.local_now,
      lc.local_now::date as today_date,
      (lc.local_now::date + interval '1 day')::date as tomorrow_date,
      lc.local_now::date::timestamp as today_start,
      ((lc.local_now::date + interval '1 day')::date)::timestamp as tomorrow_start,
      (greatest(p_lead_minutes, 0) || ' minutes')::interval as lead_window,
      (greatest(p_catchup_minutes, 0) || ' minutes')::interval as catchup_window,
      -- Does this user already have a pick for today?
      exists (
        select 1 from public.albums_of_the_day aotd
        where aotd.user_id = lc.user_id
          and aotd.date = lc.local_now::date
      ) as has_today_pick,
      -- First pick info for grace guard
      (
        select min(aotd.created_at)
        from public.albums_of_the_day aotd
        where aotd.user_id = lc.user_id
      ) as first_pick_created_at,
      (
        select count(*)
        from public.albums_of_the_day aotd
        where aotd.user_id = lc.user_id
      ) as total_picks
    from local_clock lc
  ),
  windowed as (
    select
      ts.user_id,
      ts.tz,
      ts.push_t,
      case
        -- RULE 1: Today missing wins. If the user has no pick for today's
        --         local date, they are due for today — even if we're close
        --         to midnight and tomorrow's push time is within lead window.
        when not ts.has_today_pick
         and ts.local_now >= ts.today_start
         and ts.local_now < ts.today_start + ts.catchup_window
          then ts.today_date

        -- RULE 2: Tomorrow precompute. Only allowed when:
        --   a) today's pick already exists, AND
        --   b) tomorrow's local day start is within the lead window, AND
        --   c) the user's first pick is older than the grace window
        --      (prevents rapid double-pick for brand-new users).
        when ts.has_today_pick
         and ts.tomorrow_start between ts.local_now and ts.local_now + ts.lead_window
         and (
           ts.total_picks > 1
           or ts.first_pick_created_at is null
           or ts.first_pick_created_at + grace_interval <= now()
         )
          then ts.tomorrow_date

        -- RULE 3: Catchup — today's local day started but is still within
        --         catchup window, and the pick doesn't exist yet.
        --         (Redundant with RULE 1 for clarity.)
        when not ts.has_today_pick
         and ts.local_now >= ts.today_start
         and ts.local_now < ts.today_start + ts.catchup_window
          then ts.today_date

        else null
      end as resolved_target_date
    from today_status ts
  )
  select
    w.user_id,
    w.resolved_target_date,
    w.tz,
    w.push_t
  from windowed w
  where w.resolved_target_date is not null
    -- Final guard: exclude users who already have a row for the resolved date.
    -- (Re-checked here in case a concurrent dispatch already inserted one.)
    and not exists (
      select 1 from public.albums_of_the_day aotd
      where aotd.user_id = w.user_id and aotd.date = w.resolved_target_date
    );
end;
$$;

revoke all on function public.find_users_due_for_compute(int, int, int) from public;
grant execute on function public.find_users_due_for_compute(int, int, int) to service_role;

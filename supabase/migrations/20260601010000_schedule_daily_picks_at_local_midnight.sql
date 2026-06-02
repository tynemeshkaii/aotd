-- Make the calendar day, not the notification time, define when a pick should
-- exist. The hourly dispatcher now precomputes tomorrow's pick shortly before
-- each user's local midnight and catches up during the current local day.

create or replace function public.find_users_due_for_compute(
  p_lead_minutes int default 60,
  p_catchup_minutes int default 1440
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
  day_windows as (
    select
      lc.user_id,
      lc.tz,
      lc.push_t,
      lc.local_now,
      lc.local_now::date::timestamp as today_start,
      ((lc.local_now::date + interval '1 day')::date)::timestamp as tomorrow_start,
      (greatest(p_lead_minutes, 0) || ' minutes')::interval as lead_window,
      (greatest(p_catchup_minutes, 0) || ' minutes')::interval as catchup_window
    from local_clock lc
  ),
  windowed as (
    select
      d.user_id,
      d.tz,
      d.push_t,
      case
        when d.tomorrow_start between d.local_now and d.local_now + d.lead_window
          then d.tomorrow_start::date
        when d.local_now >= d.today_start
         and d.local_now < d.today_start + d.catchup_window
          then d.today_start::date
        else null
      end as resolved_target_date
    from day_windows d
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

revoke all on function public.find_users_due_for_compute(int, int) from public, anon, authenticated;
grant execute on function public.find_users_due_for_compute(int, int) to service_role;

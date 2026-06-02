-- Fold Profile production-note stats into the existing overview RPC so Profile
-- does not need two extra client queries on mount.

create or replace function public.get_profile_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone text;
  v_today date;
  v_max_qualifying date;
  v_streak integer := 0;
  v_total_discovered integer := 0;
  v_taste jsonb;
  v_listening jsonb;
  v_library_stats jsonb;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select public.safe_profile_timezone(p.timezone)
    into v_zone
  from public.profiles p
  where p.id = p_user_id;

  v_zone := coalesce(v_zone, 'UTC');
  v_today := (now() at time zone v_zone)::date;

  select max(d)
    into v_max_qualifying
  from (
    select distinct date as d
    from public.albums_of_the_day
    where user_id = p_user_id
      and status in ('opened', 'rated')
      and date <= v_today
  ) q;

  if v_max_qualifying is not null and v_max_qualifying >= v_today - 1 then
    with days as (
      select distinct date as d
      from public.albums_of_the_day
      where user_id = p_user_id
        and status in ('opened', 'rated')
        and date <= v_today
    ),
    grouped as (
      select d, (d - (row_number() over (order by d))::int) as grp
      from days
    )
    select count(*)
      into v_streak
    from grouped
    where grp = (select grp from grouped order by d desc limit 1);
  end if;

  select count(*)
    into v_total_discovered
  from public.albums_of_the_day
  where user_id = p_user_id;

  select jsonb_build_object(
    'top_artists', coalesce((
      select jsonb_agg(jsonb_build_object('name', artist_name, 'count', c))
      from (
        select artist_name, count(*) as c
        from public.user_library
        where user_id = p_user_id
          and removed_at is null
          and artist_name is not null
          and length(trim(artist_name)) > 0
          and lower(trim(artist_name)) not in ('various artists', 'various', 'va', 'unknown', 'unknown artist')
        group by artist_name
        order by count(*) desc, artist_name asc
        limit 8
      ) a
    ), '[]'::jsonb),
    'decades', coalesce((
      select jsonb_agg(jsonb_build_object('decade', decade, 'count', c) order by decade)
      from (
        select (release_year / 10 * 10) as decade, count(*) as c
        from public.user_library
        where user_id = p_user_id
          and removed_at is null
          and release_year is not null
          and release_year between 1900 and 2100
        group by 1
      ) d
    ), '[]'::jsonb),
    'span_min', (
      select min(release_year) from public.user_library
      where user_id = p_user_id and removed_at is null
        and release_year between 1900 and 2100
    ),
    'span_max', (
      select max(release_year) from public.user_library
      where user_id = p_user_id and removed_at is null
        and release_year between 1900 and 2100
    )
  )
    into v_taste;

  select jsonb_build_object(
    'rated_this_month', count(*) filter (
      where date_trunc('month', updated_at) = date_trunc('month', now())
    ),
    'loved_count', count(*) filter (where score = 5),
    'avg_score', round(avg(score)::numeric, 1),
    'total_rated', count(*)
  )
    into v_listening
  from public.ratings
  where user_id = p_user_id;

  select jsonb_build_object(
    'albums_tracked', (
      select aggregated_albums_count
      from public.library_sync_status
      where user_id = p_user_id
    ),
    'last_synced_at', (
      select last_synced_at
      from public.streaming_connections_safe
      where user_id = p_user_id
        and provider = 'spotify'
    )
  )
    into v_library_stats;

  return jsonb_build_object(
    'streak', v_streak,
    'total_discovered', v_total_discovered,
    'taste', v_taste,
    'listening', coalesce(v_listening, jsonb_build_object(
      'rated_this_month', 0, 'loved_count', 0, 'avg_score', null, 'total_rated', 0
    )),
    'library_stats', coalesce(v_library_stats, jsonb_build_object(
      'albums_tracked', null, 'last_synced_at', null
    ))
  );
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public, anon, authenticated;
grant execute on function public.get_profile_overview(uuid) to authenticated;

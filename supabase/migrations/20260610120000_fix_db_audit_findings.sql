-- DB audit remediation — Stage 1.
--
-- Mechanical correctness/security fixes that live entirely in the database
-- layer. Each block is self-contained and re-applies the revoke/grant contract
-- per AGENTS.md (PostgreSQL grants EXECUTE to PUBLIC by default).
--
-- Covered findings:
--   1.  aotd_shadow_picks.user_id FK missing ON DELETE CASCADE.
--   3.  profiles UPDATE granted on all columns to authenticated.
--   7.  v_discovery_pick_observability reads fallback from JSON, not columns.
--   9.  save_album_rating does not cap comment length.
--   11. get_profile_overview.rated_this_month bucketed by UTC month, not user tz.
--   16. v_late_night_picks casts a raw, possibly-invalid timezone string.
--   17. handle_new_user can fail on a duplicate auth.users insert.
--   18. circuit-breaker / rate-limit advisory locks use 32-bit hashtext while
--       library sync uses 64-bit hashtextextended (shared lock space collisions).

-- =========================================================================
-- 1. aotd_shadow_picks: add ON DELETE CASCADE to the user FK.
-- =========================================================================
-- The original table used `references auth.users` with no delete action, so a
-- user deletion (future delete-account, or a manual dashboard delete) would
-- fail with a foreign-key violation. Every other user-scoped table cascades.

alter table public.aotd_shadow_picks
  drop constraint if exists aotd_shadow_picks_user_id_fkey;

alter table public.aotd_shadow_picks
  add constraint aotd_shadow_picks_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- =========================================================================
-- 3. profiles: column-scoped UPDATE for authenticated clients.
-- =========================================================================
-- A blanket `grant update on profiles` lets a client overwrite created_at and
-- any future server-owned column. Restrict UPDATE to the columns the client is
-- actually allowed to change. SELECT is unchanged. `timezone` stays writable so
-- the existing client timezone sync keeps working (a later change can route it
-- through set_profile_timezone_if_valid).

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone, preferred_push_time, onboarding_completed)
  on public.profiles to authenticated;

-- =========================================================================
-- 17. handle_new_user: make the profile insert idempotent.
-- =========================================================================
-- A duplicate insert into auth.users (rare, but possible on provider retries)
-- would otherwise abort signup on the profiles PK. Fail open.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =========================================================================
-- 9 + 11. save_album_rating (comment cap) and get_profile_overview (tz month).
--          Both functions are recreated with identical return shapes, so
--          CREATE OR REPLACE is sufficient (no signature change).
-- =========================================================================

create or replace function public.save_album_rating(
  p_user_id uuid,
  p_aotd_id uuid,
  p_score integer,
  p_comment text default null
)
returns table (
  id uuid,
  user_id uuid,
  album_id uuid,
  album_of_the_day_id uuid,
  score integer,
  comment text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_album_id uuid;
  clean_comment text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  if p_score < 1 or p_score > 5 then
    raise exception 'rating_score_out_of_range';
  end if;

  clean_comment := nullif(trim(p_comment), '');
  -- Cap journal note length. An authenticated client can call this RPC
  -- directly with an arbitrary payload, so enforce the bound server-side.
  if clean_comment is not null and length(clean_comment) > 2000 then
    raise exception 'rating_comment_too_long';
  end if;

  select aotd.album_id into target_album_id
  from public.albums_of_the_day aotd
  where aotd.id = p_aotd_id
    and aotd.user_id = p_user_id;

  if target_album_id is null then
    raise exception 'album_of_the_day_not_found';
  end if;

  insert into public.ratings (
    user_id,
    album_id,
    album_of_the_day_id,
    score,
    comment,
    is_public
  ) values (
    p_user_id,
    target_album_id,
    p_aotd_id,
    p_score,
    clean_comment,
    false
  )
  on conflict on constraint ratings_user_id_album_id_key do update set
    album_of_the_day_id = excluded.album_of_the_day_id,
    score = excluded.score,
    comment = excluded.comment,
    is_public = false,
    updated_at = now();

  update public.albums_of_the_day aotd
  set status = 'rated'
  where aotd.id = p_aotd_id
    and aotd.user_id = p_user_id;

  return query
  select
    r.id,
    r.user_id,
    r.album_id,
    r.album_of_the_day_id,
    r.score,
    r.comment,
    r.is_public,
    r.created_at,
    r.updated_at
  from public.ratings r
  where r.user_id = p_user_id
    and r.album_id = target_album_id;
end;
$$;

revoke all on function public.save_album_rating(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.save_album_rating(uuid, uuid, integer, text) to authenticated;

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

  -- Bucket "this month" in the user's local timezone so the count does not
  -- flip a day early/late near a month boundary for non-UTC users.
  select jsonb_build_object(
    'rated_this_month', count(*) filter (
      where date_trunc('month', updated_at at time zone v_zone)
          = date_trunc('month', now() at time zone v_zone)
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

-- =========================================================================
-- 7. v_discovery_pick_observability: read fallback from the real columns.
-- =========================================================================
-- selection_reason only carries is_fallback/fallback_reason on fallback picks,
-- so successful picks resolved to NULL and the fallback-share metric was wrong.
-- The authoritative source is aotd.is_fallback / aotd.fallback_reason.

create or replace view public.v_discovery_pick_observability as
select
  aotd.user_id,
  aotd.date,
  aotd.id as aotd_id,
  aotd.album_id as live_album_id,
  live_album.spotify_id as live_spotify_id,
  live_album.title as live_title,
  live_album.primary_artist_name as live_primary_artist_name,
  aotd.is_fallback as live_is_fallback,
  aotd.fallback_reason as live_fallback_reason,
  aotd.selection_reason->>'candidate_tier' as live_candidate_tier,
  aotd.selection_reason->>'popularity_bucket' as live_popularity_bucket,
  aotd.selection_reason->>'candidate_origin' as live_candidate_origin,
  aotd.selection_reason->>'primary_source_artist' as live_primary_source_artist,
  (aotd.selection_reason->>'source_artist_count')::int as live_source_artist_count,
  shadow.shadow_album_id,
  shadow_album.spotify_id as shadow_spotify_id,
  shadow_album.title as shadow_title,
  shadow_album.primary_artist_name as shadow_primary_artist_name,
  shadow.same_as_live as shadow_same_as_live,
  shadow.shadow_algorithm_version,
  shadow.shadow_selection_reason->>'candidate_tier' as shadow_candidate_tier,
  shadow.shadow_selection_reason->>'popularity_bucket' as shadow_popularity_bucket,
  shadow.shadow_selection_reason->>'candidate_origin' as shadow_candidate_origin,
  shadow.shadow_selection_reason->>'primary_source_artist' as shadow_primary_source_artist,
  shadow.created_at
from public.albums_of_the_day aotd
left join public.albums live_album on live_album.id = aotd.album_id
left join public.aotd_shadow_picks shadow
  on shadow.user_id = aotd.user_id and shadow.date = aotd.date
left join public.albums shadow_album on shadow_album.id = shadow.shadow_album_id;

revoke all on public.v_discovery_pick_observability from public, anon, authenticated, service_role;
grant select on public.v_discovery_pick_observability to service_role;

-- =========================================================================
-- 16. v_late_night_picks: validate the timezone before casting.
-- =========================================================================
-- A single row with a bad user_timezone_at_compute would raise inside
-- `at time zone` and break the whole view. Route the zone through
-- safe_profile_timezone, which falls back to UTC for invalid input.

create or replace view public.v_late_night_picks as
select
  aotd.user_id,
  aotd.date,
  aotd.created_at,
  aotd.user_timezone_at_compute,
  (aotd.created_at at time zone public.safe_profile_timezone(aotd.user_timezone_at_compute))::time
    as local_creation_time,
  (date_trunc('day', aotd.created_at at time zone public.safe_profile_timezone(aotd.user_timezone_at_compute))
    + interval '1 day')::time as local_midnight_edge,
  aotd.is_fallback,
  aotd.fallback_reason
from public.albums_of_the_day aotd
where (aotd.created_at at time zone public.safe_profile_timezone(aotd.user_timezone_at_compute))::time
  >= '23:00'::time;

revoke all on public.v_late_night_picks from public, anon, authenticated;
grant select on public.v_late_night_picks to service_role;

-- =========================================================================
-- 18. Unify advisory-lock hashing on 64-bit hashtextextended.
-- =========================================================================
-- The breaker / rate-limit RPCs locked on hashtext() (int4) while
-- try_start_library_sync uses hashtextextended() (int8). Both share Postgres'
-- single advisory-lock key space, so an int4 key sign-extends into the int8
-- space and can alias an unrelated int8 key. Move every advisory lock here to
-- hashtextextended(..., 0). Bodies are otherwise unchanged; return shapes are
-- identical, so CREATE OR REPLACE is safe.

create or replace function public.reserve_external_api_slot(
  p_service text,
  p_endpoint text,
  p_interval_ms integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_next timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service || ':' || p_endpoint || ':rate', 0));

  insert into public.external_api_rate_limits(service, endpoint, next_allowed_at)
  values (p_service, p_endpoint, v_now)
  on conflict (service, endpoint) do nothing;

  select next_allowed_at into v_next
  from public.external_api_rate_limits
  where service = p_service and endpoint = p_endpoint
  for update;

  update public.external_api_rate_limits
  set
    next_allowed_at = greatest(v_now, v_next)
      + ((greatest(p_interval_ms, 0)::text || ' milliseconds')::interval),
    updated_at = v_now
  where service = p_service and endpoint = p_endpoint;

  return greatest(v_now, v_next);
end;
$$;

revoke all on function public.reserve_external_api_slot(text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_external_api_slot(text, text, integer) to service_role;

create or replace function public.get_external_api_circuit_state(
  p_service text,
  p_endpoint text
)
returns table (
  state text,
  cooldown_until timestamptz,
  failure_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_probe_claimed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service || ':' || p_endpoint || ':breaker', 0));

  insert into public.external_api_circuit_breakers(service, endpoint, state)
  values (p_service, p_endpoint, 'closed')
  on conflict (service, endpoint) do nothing;

  update public.external_api_circuit_breakers
  set
    state = 'half_open',
    cooldown_until = now() + interval '1 minute',
    updated_at = now()
  where service = p_service
    and endpoint = p_endpoint
    and (
      (state = 'open' and cooldown_until is not null and cooldown_until <= now())
      or (state = 'half_open' and cooldown_until is not null and cooldown_until <= now())
    );
  get diagnostics v_probe_claimed_count = row_count;

  return query
  select
    case
      when b.state = 'half_open' and v_probe_claimed_count = 0 then 'open'
      else b.state
    end as state,
    b.cooldown_until,
    b.failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint;
end;
$$;

create or replace function public.record_external_api_circuit_success(
  p_service text,
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service || ':' || p_endpoint || ':breaker', 0));

  insert into public.external_api_circuit_breakers(
    service,
    endpoint,
    state,
    opened_at,
    cooldown_until,
    last_status,
    last_error,
    failure_count,
    updated_at
  )
  values (p_service, p_endpoint, 'closed', null, null, null, null, 0, now())
  on conflict (service, endpoint) do update
  set
    state = 'closed',
    opened_at = null,
    cooldown_until = null,
    last_status = null,
    last_error = null,
    failure_count = 0,
    updated_at = now();
end;
$$;

create or replace function public.record_external_api_circuit_failure(
  p_service text,
  p_endpoint text,
  p_status integer,
  p_error text,
  p_cooldown_seconds integer
)
returns table (
  state text,
  cooldown_until timestamptz,
  failure_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failure_count integer;
  v_cooldown_seconds integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_service || ':' || p_endpoint || ':breaker', 0));

  insert into public.external_api_circuit_breakers(service, endpoint, state, failure_count)
  values (p_service, p_endpoint, 'closed', 0)
  on conflict (service, endpoint) do nothing;

  select b.failure_count + 1 into v_failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint
  for update;

  v_cooldown_seconds := greatest(coalesce(p_cooldown_seconds, 0), 0);

  update public.external_api_circuit_breakers b
  set
    state = case when v_cooldown_seconds > 0 then 'open' else 'closed' end,
    opened_at = case when v_cooldown_seconds > 0 then now() else null end,
    cooldown_until = case
      when v_cooldown_seconds > 0 then now() + make_interval(secs => v_cooldown_seconds)
      else null
    end,
    last_status = p_status,
    last_error = left(p_error, 500),
    failure_count = v_failure_count,
    updated_at = now()
  where b.service = p_service and b.endpoint = p_endpoint;

  return query
  select b.state, b.cooldown_until, b.failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint;
end;
$$;

revoke all on function public.get_external_api_circuit_state(text, text) from public, anon, authenticated;
revoke all on function public.record_external_api_circuit_success(text, text) from public, anon, authenticated;
revoke all on function public.record_external_api_circuit_failure(text, text, integer, text, integer)
  from public, anon, authenticated;

grant execute on function public.get_external_api_circuit_state(text, text) to service_role;
grant execute on function public.record_external_api_circuit_success(text, text) to service_role;
grant execute on function public.record_external_api_circuit_failure(text, text, integer, text, integer)
  to service_role;

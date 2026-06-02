-- Artist Country Chip: cache MusicBrainz artist countries and expose them
-- through the recommendation read RPCs.

alter table public.albums
  add column if not exists artist_country text
  check (artist_country is null or artist_country ~ '^[A-Z]{2}$');

alter table public.musicbrainz_release_group_cache
  add column if not exists mb_artist_id text,
  add column if not exists mb_artist_name text,
  add column if not exists artist_credit_resolved boolean not null default false;

create index if not exists mb_rg_cache_artist_idx
  on public.musicbrainz_release_group_cache(mb_artist_id)
  where mb_artist_id is not null;

create table if not exists public.mb_artist_cache (
  mb_artist_id text primary key,
  name text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  resolved boolean not null default true,
  fetched_at timestamptz not null default now()
);

create index if not exists mb_artist_cache_fetched_idx
  on public.mb_artist_cache(fetched_at);

alter table public.mb_artist_cache enable row level security;
revoke all on public.mb_artist_cache from public, anon, authenticated;

drop function if exists public.get_current_pick(uuid);
drop function if exists public.get_discoveries(uuid);
drop function if exists public.get_discoveries(uuid, integer, integer);
drop function if exists public.get_discovery_detail(uuid, uuid);
drop function if exists public.discovery_album_rows(uuid);

create or replace function public.discovery_album_rows(p_user_id uuid)
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
  album_artist_country text,
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
language sql
security definer
set search_path = public
as $$
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
    a.artist_country,
    a.cover_url,
    a.spotify_id,
    a.release_year,
    a.total_tracks,
    a.duration_ms,
    r.id,
    r.score,
    r.comment,
    r.created_at,
    r.updated_at
  from public.albums_of_the_day aotd
  join public.albums a on a.id = aotd.album_id
  left join public.ratings r
    on r.user_id = aotd.user_id
   and r.album_id = aotd.album_id
  where aotd.user_id = p_user_id
$$;

revoke all on function public.discovery_album_rows(uuid) from public, anon, authenticated;
grant execute on function public.discovery_album_rows(uuid) to service_role;

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
  album_artist_country text,
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

revoke all on function public.get_current_pick(uuid) from public, anon, authenticated;
grant execute on function public.get_current_pick(uuid) to authenticated;

create or replace function public.get_discoveries(
  p_user_id uuid,
  p_limit integer default 365,
  p_offset integer default 0
)
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
  album_artist_country text,
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public.discovery_album_rows(p_user_id) d
  order by d.pick_date desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.get_discoveries(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_discoveries(uuid, integer, integer) to authenticated;

create or replace function public.get_discovery_detail(p_user_id uuid, p_aotd_id uuid)
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
  album_artist_country text,
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public.discovery_album_rows(p_user_id) d
  where d.aotd_id = p_aotd_id
  limit 1;
end;
$$;

revoke all on function public.get_discovery_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_discovery_detail(uuid, uuid) to authenticated;

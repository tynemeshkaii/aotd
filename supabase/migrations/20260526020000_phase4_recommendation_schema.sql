-- Phase 4: recommendation algorithm data layer.

-- 1) albums: global cached metadata. Public read for any authed user.
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  spotify_id text unique not null,
  -- Not unique: Spotify can expose multiple editions/remasters that resolve to
  -- the same MusicBrainz release-group. We dedupe per-user at candidate time,
  -- but don't let a cache row fail because of an alternate Spotify edition.
  mb_release_group_id text,
  title text not null,
  primary_artist_name text not null,
  primary_artist_spotify_id text,
  release_year integer,
  cover_url text,
  total_tracks integer,
  duration_ms integer,
  album_type text,
  lastfm_listeners bigint,
  lastfm_playcount bigint,
  lastfm_url text,
  audio_features jsonb,
  is_prewarm_seed boolean not null default false,
  metadata_updated_at timestamptz not null default now()
);

create index albums_spotify_idx on public.albums(spotify_id);
create index albums_mb_idx on public.albums(mb_release_group_id)
  where mb_release_group_id is not null;
create index albums_primary_artist_idx on public.albums(primary_artist_spotify_id)
  where primary_artist_spotify_id is not null;
create index albums_listeners_idx on public.albums(lastfm_listeners desc nulls last);
create index albums_playcount_idx on public.albums(lastfm_playcount desc nulls last);
create index albums_prewarm_idx on public.albums(is_prewarm_seed)
  where is_prewarm_seed = true;

alter table public.albums enable row level security;
revoke all on public.albums from anon, authenticated;
grant select on public.albums to authenticated;
create policy "albums_select_all" on public.albums
  for select using (auth.role() = 'authenticated');

-- 2) artist_similarity_cache with FLEXIBLE KEY.
create table public.artist_similarity_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('lastfm', 'spotify')),
  source_artist_key text not null,
  source_artist_name text not null,
  similar_artists jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source, source_artist_key)
);

create index artist_sim_fetched_idx on public.artist_similarity_cache(fetched_at);

alter table public.artist_similarity_cache enable row level security;
revoke all on public.artist_similarity_cache from anon, authenticated;

-- 3) audio_features_cache (per Spotify track ID).
create table public.audio_features_cache (
  spotify_track_id text primary key,
  features jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.audio_features_cache enable row level security;
revoke all on public.audio_features_cache from anon, authenticated;

-- 4) musicbrainz_release_group_cache.
create table public.musicbrainz_release_group_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_artist text not null,
  normalized_album text not null,
  release_group_id text,
  primary_type text,
  secondary_types text[] not null default '{}',
  first_release_date text,
  fetched_at timestamptz not null default now(),
  unique (normalized_artist, normalized_album)
);

create index mb_rg_cache_fetched_idx on public.musicbrainz_release_group_cache(fetched_at);
create index mb_rg_cache_release_group_idx on public.musicbrainz_release_group_cache(release_group_id)
  where release_group_id is not null;

alter table public.musicbrainz_release_group_cache enable row level security;
revoke all on public.musicbrainz_release_group_cache from anon, authenticated;

-- 5) albums_of_the_day with fallback_reason.
create table public.albums_of_the_day (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  album_id uuid not null references public.albums(id),
  algorithm_version integer not null default 1,
  selection_reason jsonb not null,
  status text not null check (status in ('pending', 'opened', 'rated')) default 'pending',
  opened_at timestamptz,
  is_fallback boolean not null default false,
  fallback_reason text
    check (
      (is_fallback = false and fallback_reason is null)
      or (is_fallback = true and fallback_reason in (
        'no_candidates',
        'spotify_search_failed',
        'spotify_audio_unavailable',
        'lastfm_unavailable',
        'mb_timeout',
        'library_too_small',
        'compute_timeout',
        'unknown_error'
      ))
    ),
  user_timezone_at_compute text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index aotd_user_date_idx on public.albums_of_the_day(user_id, date desc);

alter table public.albums_of_the_day enable row level security;
revoke all on public.albums_of_the_day from anon, authenticated;
grant select, update on public.albums_of_the_day to authenticated;

create policy "aotd_select_own" on public.albums_of_the_day
  for select using (auth.uid() = user_id);

create policy "aotd_update_own_status" on public.albums_of_the_day
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.aotd_guard_client_update()
returns trigger language plpgsql as $$
begin
  if old.user_id is distinct from new.user_id
     or old.album_id is distinct from new.album_id
     or old.date is distinct from new.date
     or old.algorithm_version is distinct from new.algorithm_version
     or old.selection_reason is distinct from new.selection_reason
     or old.is_fallback is distinct from new.is_fallback
     or old.fallback_reason is distinct from new.fallback_reason
     or old.user_timezone_at_compute is distinct from new.user_timezone_at_compute
     or old.created_at is distinct from new.created_at
  then
    raise exception 'aotd_immutable_field';
  end if;
  return new;
end;
$$;

create trigger aotd_guard_client_update_trg
  before update on public.albums_of_the_day
  for each row
  when (coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') <> 'service_role')
  execute procedure public.aotd_guard_client_update();

alter publication supabase_realtime add table public.albums_of_the_day;

-- 6) recommendation_history: never recommend same album twice ever (per user).
create table public.recommendation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id),
  recommended_at timestamptz not null default now(),
  unique (user_id, album_id)
);

create index reco_history_user_idx on public.recommendation_history(user_id, recommended_at desc);

alter table public.recommendation_history enable row level security;
revoke all on public.recommendation_history from anon, authenticated;

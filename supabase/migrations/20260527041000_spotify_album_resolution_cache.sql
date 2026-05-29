-- Global cache for resolving text artist/album pairs to Spotify albums.

create table public.spotify_album_resolution_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_artist text not null,
  normalized_album text not null,
  requested_artist text not null,
  requested_album text not null,
  spotify_album_id text,
  status text not null check (status in (
    'resolved',
    'no_match',
    'bad_match',
    'rate_limited',
    'spotify_unavailable'
  )),
  result jsonb,
  failure_status integer,
  failure_detail text,
  fetched_at timestamptz not null default now(),
  next_retry_at timestamptz,
  unique (normalized_artist, normalized_album)
);

create index spotify_album_resolution_status_retry_idx
  on public.spotify_album_resolution_cache(status, next_retry_at);

create index spotify_album_resolution_spotify_album_idx
  on public.spotify_album_resolution_cache(spotify_album_id)
  where spotify_album_id is not null;

alter table public.spotify_album_resolution_cache enable row level security;
revoke all on public.spotify_album_resolution_cache from anon, authenticated;

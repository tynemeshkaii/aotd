-- Global Last.fm artist top-albums cache.

create table public.lastfm_artist_top_albums_cache (
  normalized_artist text primary key,
  artist_name text not null,
  top_albums jsonb not null,
  fetched_at timestamptz not null default now()
);

create index lastfm_artist_top_albums_fetched_idx
  on public.lastfm_artist_top_albums_cache(fetched_at);

alter table public.lastfm_artist_top_albums_cache enable row level security;
revoke all on public.lastfm_artist_top_albums_cache from anon, authenticated;

-- Phase 4 prep: capture Spotify artist IDs in user_library so the algorithm
-- can lookup similar artists without a name search round-trip.
-- Existing rows have NULL until the next sync runs; algorithm handles both.

alter table public.user_library
  add column if not exists primary_artist_spotify_id text,
  add column if not exists artist_ids jsonb;  -- [{id, name}, ...] for collabs

create index if not exists user_library_primary_artist_idx
  on public.user_library(primary_artist_spotify_id)
  where primary_artist_spotify_id is not null;

-- Phase 3: user's Spotify library (saved albums + saved tracks aggregated to albums)
-- and library sync status (single row per user, Realtime-published for progress UI).

create table public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_album_id text not null,
  mb_release_group_id text,
  album_name text not null,
  artist_name text not null,
  cover_url text,
  total_tracks integer,
  release_year integer,
  added_at_provider timestamptz,
  source jsonb not null default '{}'::jsonb,
  -- source schema: { "saved_album": bool, "saved_tracks_count": int }
  synced_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (user_id, provider, provider_album_id)
);

create index user_library_user_idx on public.user_library(user_id);
create index user_library_user_active_idx
  on public.user_library(user_id)
  where removed_at is null;
create index user_library_mb_idx on public.user_library(mb_release_group_id)
  where mb_release_group_id is not null;

alter table public.user_library enable row level security;

-- Writes go through the Edge Function via service role; clients only read.
revoke all on public.user_library from anon, authenticated;
grant select on public.user_library to authenticated;

create policy "user_library_select_own"
  on public.user_library
  for select
  using (auth.uid() = user_id);

-- Library sync status: one row per user, updated by the Edge Function.
create table public.library_sync_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  status text not null check (status in ('idle', 'queued', 'syncing', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  total_estimate integer,
  processed_count integer not null default 0,
  saved_albums_count integer,
  saved_tracks_count integer,
  aggregated_albums_count integer,
  error_code text,
  error_message text,
  updated_at timestamptz not null default now()
);

alter table public.library_sync_status enable row level security;

revoke all on public.library_sync_status from anon, authenticated;
grant select on public.library_sync_status to authenticated;

create policy "library_sync_status_select_own"
  on public.library_sync_status
  for select
  using (auth.uid() = user_id);

-- Realtime publication for live progress updates on the client.
alter publication supabase_realtime add table public.library_sync_status;

create or replace function public.touch_library_sync_status()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger library_sync_status_touch
  before update on public.library_sync_status
  for each row execute procedure public.touch_library_sync_status();

-- Convenience view: only active (non-removed) library rows for the client.
-- Keep security definer (default) to match streaming_connections_safe pattern;
-- explicit auth.uid() filter scopes results per-user.
create view public.user_library_active as
  select
    id,
    user_id,
    provider,
    provider_album_id,
    mb_release_group_id,
    album_name,
    artist_name,
    cover_url,
    total_tracks,
    release_year,
    added_at_provider,
    source,
    synced_at
  from public.user_library
  where removed_at is null
    and auth.uid() = user_id;

grant select on public.user_library_active to authenticated;

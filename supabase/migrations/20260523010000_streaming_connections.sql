-- Phase 2: Spotify auth connection storage.
-- Base token rows are service-role only; the client reads metadata through
-- public.streaming_connections_safe.

create extension if not exists "pgcrypto";
create extension if not exists pgsodium;

create table public.streaming_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_user_id text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (user_id, provider)
);

create index streaming_connections_user_idx on public.streaming_connections(user_id);
create index streaming_connections_provider_user_idx
  on public.streaming_connections(provider, provider_user_id);

alter table public.streaming_connections enable row level security;

revoke all on public.streaming_connections from anon, authenticated;
grant delete on public.streaming_connections to authenticated;

create policy "streaming_connections_delete_own"
  on public.streaming_connections
  for delete
  using (auth.uid() = user_id);

create view public.streaming_connections_safe as
  select id, user_id, provider, provider_user_id, scopes, connected_at, last_synced_at
  from public.streaming_connections
  where auth.uid() = user_id;

grant select on public.streaming_connections_safe to authenticated;

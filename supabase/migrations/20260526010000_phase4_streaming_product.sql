-- Phase 4 prep: capture Spotify product type (Premium/Free) for the explainer
-- in phase 5. Stored in connections; exposed via the safe view.

alter table public.streaming_connections
  add column if not exists spotify_product text
  check (spotify_product is null or spotify_product in ('premium', 'free', 'open'));

-- Rebuild safe view to expose spotify_product.
-- Keep security definer (security_invoker = false) per CLAUDE.md rule.
drop view if exists public.streaming_connections_safe;
create view public.streaming_connections_safe as
  select
    id, user_id, provider, provider_user_id, scopes,
    spotify_product,
    connected_at, last_synced_at
  from public.streaming_connections
  where auth.uid() = user_id;

alter view public.streaming_connections_safe set (security_invoker = false);
grant select on public.streaming_connections_safe to authenticated;

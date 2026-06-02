-- Safe discovery observability view: joins daily picks, albums, and shadow picks
-- into one analysis surface for live-vs-shadow recommendation inspection.
--
-- Answers:
--   - How often does shadow choose a different top album?
--   - Which candidate tiers are being served live?
--   - Which tiers are being chosen by shadow?
--   - What share of live picks are fallback?
--   - What share of picks are familiar-catalog vs similar-artist?
--   - Are popularity buckets shifting in shadow compared with live?

create or replace view public.v_discovery_pick_observability as
select
  aotd.user_id,
  aotd.date,
  aotd.id as aotd_id,
  aotd.album_id as live_album_id,
  live_album.spotify_id as live_spotify_id,
  live_album.title as live_title,
  live_album.primary_artist_name as live_primary_artist_name,
  (aotd.selection_reason->>'is_fallback')::boolean as live_is_fallback,
  aotd.selection_reason->>'fallback_reason' as live_fallback_reason,
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

-- Security: service-role only. No RLS policies on views; revoke client access
-- and grant select explicitly to service_role.
revoke all on public.v_discovery_pick_observability from anon, authenticated;
grant select on public.v_discovery_pick_observability to service_role;

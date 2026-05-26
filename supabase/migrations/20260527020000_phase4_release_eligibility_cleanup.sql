-- Phase 4 hardening: remove singles/compilations from the curated fallback seed pool.
-- Keep the album cache rows; only stop them from being fallback recommendations.

update public.albums
set is_prewarm_seed = false
where is_prewarm_seed = true
  and (
    coalesce(total_tracks, 0) <= 1
    or lower(coalesce(album_type, '')) = 'compilation'
    or (
      lower(coalesce(album_type, '')) = 'single'
      and coalesce(total_tracks, 0) < 3
      and coalesce(duration_ms, 0) < 10 * 60 * 1000
    )
  );

-- Phase 5 cleanup: drop unreachable direct-write policies on public.ratings.
--
-- The initial Phase 5 migration `revoke all ... from authenticated` and then
-- granted only SELECT, so authenticated clients never had table-level INSERT or
-- UPDATE privilege. The `ratings_insert_own_private` / `ratings_update_own_private`
-- policies could therefore never be exercised — all writes intentionally go
-- through the SECURITY DEFINER `save_album_rating` RPC, which validates that the
-- album belongs to one of the caller's own albums_of_the_day rows.
--
-- Keeping dead policies around is misleading: a future change that grants
-- INSERT/UPDATE to authenticated would silently let clients write arbitrary
-- ratings (including for albums they were never recommended). Removing them
-- makes the "RPC-only writes" contract explicit. If direct client writes are
-- ever wanted, add policies deliberately alongside the matching grants.

drop policy if exists "ratings_insert_own_private" on public.ratings;
drop policy if exists "ratings_update_own_private" on public.ratings;

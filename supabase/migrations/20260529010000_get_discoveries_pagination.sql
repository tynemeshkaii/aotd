-- Phase 5: bound get_discoveries so it can't return an unbounded result set.
--
-- The original get_discoveries(uuid) returned every albums_of_the_day row for
-- the user on each call, and it's read on both Home and Discoveries. Add
-- pagination params with sane defaults. Existing callers that pass only
-- p_user_id resolve to this overload via the defaults and get the most recent
-- 365 picks — comfortably more than a v1 user can accumulate before infinite
-- scroll lands, while capping the pathological case.
--
-- The return table is unchanged, but Postgres requires dropping a function
-- before altering its argument signature.

drop function if exists public.get_discoveries(uuid);

create or replace function public.get_discoveries(
  p_user_id uuid,
  p_limit integer default 365,
  p_offset integer default 0
)
returns table (
  aotd_id uuid,
  pick_date date,
  status text,
  is_fallback boolean,
  fallback_reason text,
  selection_reason jsonb,
  opened_at timestamptz,
  album_id uuid,
  album_title text,
  album_primary_artist_name text,
  album_cover_url text,
  album_spotify_id text,
  album_release_year int,
  album_total_tracks int,
  album_duration_ms int,
  rating_id uuid,
  rating_score int,
  rating_comment text,
  rating_created_at timestamptz,
  rating_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  return query
  select *
  from public.discovery_album_rows(p_user_id) d
  order by d.pick_date desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.get_discoveries(uuid, integer, integer) from public;
grant execute on function public.get_discoveries(uuid, integer, integer) to authenticated;

-- Cap caller-supplied get_discoveries limits. The client uses the default,
-- but authenticated callers can invoke RPCs directly with arbitrary args.

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
  album_artist_country text,
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
  limit least(greatest(p_limit, 0), 365)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.get_discoveries(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_discoveries(uuid, integer, integer) to authenticated;

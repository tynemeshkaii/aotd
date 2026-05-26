-- Phase 5 manual QA fixes.
-- This migration patches projects that already applied the initial Phase 5 migration.

create or replace function public.save_album_rating(
  p_user_id uuid,
  p_aotd_id uuid,
  p_score integer,
  p_comment text default null
)
returns table (
  id uuid,
  user_id uuid,
  album_id uuid,
  album_of_the_day_id uuid,
  score integer,
  comment text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_album_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  if p_score < 1 or p_score > 5 then
    raise exception 'rating_score_out_of_range';
  end if;

  select aotd.album_id into target_album_id
  from public.albums_of_the_day aotd
  where aotd.id = p_aotd_id
    and aotd.user_id = p_user_id;

  if target_album_id is null then
    raise exception 'album_of_the_day_not_found';
  end if;

  insert into public.ratings (
    user_id,
    album_id,
    album_of_the_day_id,
    score,
    comment,
    is_public
  ) values (
    p_user_id,
    target_album_id,
    p_aotd_id,
    p_score,
    nullif(trim(p_comment), ''),
    false
  )
  on conflict on constraint ratings_user_id_album_id_key do update set
    album_of_the_day_id = excluded.album_of_the_day_id,
    score = excluded.score,
    comment = excluded.comment,
    is_public = false,
    updated_at = now();

  update public.albums_of_the_day aotd
  set status = 'rated'
  where aotd.id = p_aotd_id
    and aotd.user_id = p_user_id;

  return query
  select
    r.id,
    r.user_id,
    r.album_id,
    r.album_of_the_day_id,
    r.score,
    r.comment,
    r.is_public,
    r.created_at,
    r.updated_at
  from public.ratings r
  where r.user_id = p_user_id
    and r.album_id = target_album_id;
end;
$$;

revoke all on function public.save_album_rating(uuid, uuid, integer, text) from public;
grant execute on function public.save_album_rating(uuid, uuid, integer, text) to authenticated;

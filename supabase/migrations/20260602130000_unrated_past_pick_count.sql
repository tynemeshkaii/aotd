-- Lightweight Home count for old unrated picks. Avoid loading the full archive
-- just to decide whether to show the footer nudge.

create or replace function public.get_unrated_past_pick_count(
  p_user_id uuid,
  p_exclude_aotd_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pick_count integer;
  user_tz text;
  today_local date;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  select public.safe_profile_timezone(p.timezone) into user_tz
  from public.profiles p where p.id = p_user_id;

  today_local := (now() at time zone coalesce(user_tz, 'UTC'))::date;

  select count(*)::integer into pick_count
  from public.albums_of_the_day aotd
  where aotd.user_id = p_user_id
    and aotd.date < today_local
    and aotd.status <> 'rated'
    and (p_exclude_aotd_id is null or aotd.id <> p_exclude_aotd_id);

  return coalesce(pick_count, 0);
end;
$$;

revoke all on function public.get_unrated_past_pick_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_unrated_past_pick_count(uuid, uuid) to authenticated;

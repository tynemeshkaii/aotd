-- Phase B: Monthly Review recap RPCs.
-- Buckets by albums_of_the_day.date, which is already the user's local pick date.

create or replace function public.get_recap_months(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('month', month_start, 'issues', issue_count) order by month_start desc)
    from (
      select date_trunc('month', aotd.date)::date as month_start, count(*) as issue_count
      from public.albums_of_the_day aotd
      where aotd.user_id = p_user_id
      group by 1
    ) months
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_monthly_recap(p_user_id uuid, p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_result jsonb;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with picks as (
    select *
    from public.discovery_album_rows(p_user_id) d
    where d.pick_date >= v_start
      and d.pick_date < v_end
  ),
  top_pick as (
    select jsonb_build_object(
      'aotd_id', p.aotd_id,
      'issue_number', p.issue_number,
      'pick_date', p.pick_date,
      'status', p.status,
      'album_title', p.album_title,
      'album_primary_artist_name', p.album_primary_artist_name,
      'album_cover_url', p.album_cover_url,
      'album_spotify_id', p.album_spotify_id,
      'rating_score', p.rating_score
    ) as value
    from picks p
    where p.rating_score is not null
    order by p.rating_score desc, p.pick_date desc, p.issue_number desc
    limit 1
  )
  select jsonb_build_object(
    'month', v_start,
    'issues_count', (select count(*) from picks),
    'opened_count', (select count(*) from picks where status in ('opened', 'rated')),
    'rated_count', (select count(*) from picks where rating_score is not null),
    'rating_spread', jsonb_build_object(
      '5', (select count(*) from picks where rating_score = 5),
      '4', (select count(*) from picks where rating_score = 4),
      '3', (select count(*) from picks where rating_score = 3),
      '2', (select count(*) from picks where rating_score = 2),
      '1', (select count(*) from picks where rating_score = 1)
    ),
    'avg_score', (select round(avg(rating_score)::numeric, 1) from picks where rating_score is not null),
    'top_finding', (select value from top_pick),
    'span_min', (
      select min(release_year)
      from public.user_library
      where user_id = p_user_id
        and removed_at is null
        and release_year between 1900 and 2100
    ),
    'span_max', (
      select max(release_year)
      from public.user_library
      where user_id = p_user_id
        and removed_at is null
        and release_year between 1900 and 2100
    )
  )
    into v_result;

  return coalesce(v_result, jsonb_build_object(
    'month', v_start,
    'issues_count', 0,
    'opened_count', 0,
    'rated_count', 0,
    'rating_spread', jsonb_build_object('5', 0, '4', 0, '3', 0, '2', 0, '1', 0),
    'avg_score', null,
    'top_finding', null,
    'span_min', null,
    'span_max', null
  ));
end;
$$;

revoke all on function public.get_recap_months(uuid) from public, anon, authenticated;
grant execute on function public.get_recap_months(uuid) to authenticated;

revoke all on function public.get_monthly_recap(uuid, date) from public, anon, authenticated;
grant execute on function public.get_monthly_recap(uuid, date) to authenticated;

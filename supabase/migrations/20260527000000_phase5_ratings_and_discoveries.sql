-- Phase 5: ratings, discoveries history, and shared album detail reads.

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  album_of_the_day_id uuid references public.albums_of_the_day(id) on delete set null,
  score integer not null check (score between 1 and 5),
  comment text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, album_id)
);

create index ratings_user_updated_idx on public.ratings(user_id, updated_at desc);
create index ratings_user_score_idx on public.ratings(user_id, score);
create index ratings_aotd_idx on public.ratings(album_of_the_day_id)
  where album_of_the_day_id is not null;

alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;
grant select on public.ratings to authenticated;

create policy "ratings_select_own" on public.ratings
  for select using (auth.uid() = user_id);

create policy "ratings_insert_own_private" on public.ratings
  for insert with check (auth.uid() = user_id and is_public = false);

create policy "ratings_update_own_private" on public.ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id and is_public = false);

create or replace function public.touch_rating_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.is_public = false;
  return new;
end;
$$;

create trigger touch_rating_updated_at_trg
  before update on public.ratings
  for each row
  execute procedure public.touch_rating_updated_at();

alter publication supabase_realtime add table public.ratings;

create or replace function public.aotd_guard_client_update()
returns trigger language plpgsql as $$
begin
  if old.user_id is distinct from new.user_id
     or old.album_id is distinct from new.album_id
     or old.date is distinct from new.date
     or old.algorithm_version is distinct from new.algorithm_version
     or old.selection_reason is distinct from new.selection_reason
     or old.is_fallback is distinct from new.is_fallback
     or old.fallback_reason is distinct from new.fallback_reason
     or old.user_timezone_at_compute is distinct from new.user_timezone_at_compute
     or old.created_at is distinct from new.created_at
  then
    raise exception 'aotd_immutable_field';
  end if;

  if old.status = 'pending' and new.status not in ('pending', 'opened', 'rated') then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if old.status = 'opened' and new.status not in ('opened', 'rated') then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if old.status = 'rated' and new.status <> 'rated' then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if new.status = 'pending' and old.opened_at is distinct from new.opened_at then
    raise exception 'aotd_opened_at_without_opened_status';
  end if;

  if new.status in ('opened', 'rated') and old.opened_at is null then
    new.opened_at = now();
  end if;

  if new.status in ('opened', 'rated')
     and old.opened_at is not null
     and old.opened_at is distinct from new.opened_at
  then
    raise exception 'aotd_opened_at_immutable';
  end if;

  return new;
end;
$$;

create or replace function public.discovery_album_rows(p_user_id uuid)
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
language sql
security definer
set search_path = public
as $$
  select
    aotd.id,
    aotd.date,
    aotd.status,
    aotd.is_fallback,
    aotd.fallback_reason,
    aotd.selection_reason,
    aotd.opened_at,
    a.id,
    a.title,
    a.primary_artist_name,
    a.cover_url,
    a.spotify_id,
    a.release_year,
    a.total_tracks,
    a.duration_ms,
    r.id,
    r.score,
    r.comment,
    r.created_at,
    r.updated_at
  from public.albums_of_the_day aotd
  join public.albums a on a.id = aotd.album_id
  left join public.ratings r
    on r.user_id = aotd.user_id
   and r.album_id = aotd.album_id
  where aotd.user_id = p_user_id
$$;

revoke all on function public.discovery_album_rows(uuid) from public;

drop function if exists public.get_current_pick(uuid);

create or replace function public.get_current_pick(p_user_id uuid)
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
declare
  user_tz text;
  today_local date;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  select coalesce(p.timezone, 'UTC') into user_tz
  from public.profiles p where p.id = p_user_id;

  today_local := (now() at time zone coalesce(user_tz, 'UTC'))::date;

  return query
  select *
  from public.discovery_album_rows(p_user_id) d
  where d.pick_date = today_local
  limit 1;
end;
$$;

revoke all on function public.get_current_pick(uuid) from public;
grant execute on function public.get_current_pick(uuid) to authenticated;

create or replace function public.get_discoveries(p_user_id uuid)
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
  order by d.pick_date desc;
end;
$$;

revoke all on function public.get_discoveries(uuid) from public;
grant execute on function public.get_discoveries(uuid) to authenticated;

create or replace function public.get_discovery_detail(p_user_id uuid, p_aotd_id uuid)
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
  where d.aotd_id = p_aotd_id
  limit 1;
end;
$$;

revoke all on function public.get_discovery_detail(uuid, uuid) from public;
grant execute on function public.get_discovery_detail(uuid, uuid) to authenticated;

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

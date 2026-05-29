-- Phase 4 v2: cache-first recommendation candidates.

create table public.recommendation_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('lastfm', 'spotify')),
  source_artist_key text not null,
  source_artist_name text not null,
  candidate_artist_name text not null,
  candidate_artist_spotify_id text,
  candidate_album_name text not null,
  spotify_album_id text,
  mb_release_group_id text,
  album_type text,
  total_tracks integer,
  duration_ms integer,
  release_year integer,
  cover_url text,
  lastfm_listeners bigint,
  lastfm_playcount bigint,
  similarity_match double precision,
  popularity_bucket text check (popularity_bucket in ('unknown', 'deep', 'niche', 'known', 'mainstream')),
  eligibility_status text not null
    check (eligibility_status in (
      'eligible',
      'unresolved',
      'not_release_like',
      'compilation_or_live',
      'spotify_unavailable',
      'duplicate_or_bad_match'
    )),
  rejection_reason text,
  resolved_at timestamptz,
  fetched_at timestamptz not null default now(),
  next_retry_at timestamptz,
  unique (source, source_artist_key, candidate_artist_name, candidate_album_name)
);

create index recommendation_candidates_source_artist_eligible_idx
  on public.recommendation_candidates(source_artist_key, eligibility_status)
  where eligibility_status = 'eligible';

create index recommendation_candidates_spotify_album_idx
  on public.recommendation_candidates(spotify_album_id)
  where spotify_album_id is not null;

create unique index recommendation_candidates_strict_resolved_idx
  on public.recommendation_candidates(source_artist_key, spotify_album_id)
  where spotify_album_id is not null;

create index recommendation_candidates_retry_idx
  on public.recommendation_candidates(next_retry_at)
  where eligibility_status in ('unresolved', 'spotify_unavailable');

create index recommendation_candidates_fetched_idx
  on public.recommendation_candidates(fetched_at desc);

alter table public.recommendation_candidates enable row level security;
revoke all on public.recommendation_candidates from anon, authenticated;

create or replace view public.v1_fallback_health
with (security_invoker = true) as
select
  date_trunc('day', created_at) as day,
  count(*) as total_picks,
  count(*) filter (where is_fallback) as fallback_count,
  round(100.0 * count(*) filter (where is_fallback) / nullif(count(*), 0), 1) as fallback_pct,
  array_agg(distinct fallback_reason) filter (where is_fallback) as fallback_reasons
from public.albums_of_the_day
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;

grant select on public.v1_fallback_health to authenticated;

# API request optimization plan

> **Status:** implementation plan, not yet implemented.
> **Date:** 2026-05-26.
> **Scope:** Spotify Web API, Last.fm API, MusicBrainz API, Supabase Edge Function self-calls.
> **Why this exists:** real manual QA hit `spotify_search_failed` during `prewarm-user-candidates`, showing that external API pressure can still break candidate warming even after cache-first compute.

---

## 0. Executive summary

The app should not depend on live Spotify Search during daily pick computation. The durable architecture is:

```text
User sync imports library once/bounded
  -> background jobs resolve candidate metadata gradually
  -> compute-album-of-the-day reads only local DB in the normal case
  -> external APIs are protected by cache, circuit breakers, and distributed rate limits
```

The highest-impact changes are:

1. Add a global Spotify album resolution cache with negative caching.
2. Add external API circuit breakers, starting with `spotify:search`.
3. Change candidate generation to score Last.fm candidates first, then resolve only top K through Spotify.
4. Add Last.fm `artist.getTopAlbums` cache.
5. Add DB-backed distributed rate limiting across Edge Function instances.
6. Make Spotify library sync less eager after the initial sync.
7. Add jittered cron scheduling and API request observability.

The key product target:

```text
Warm compute: 0 Spotify Search calls
Normal prewarm after caches mature: 0-5 Spotify Search calls/user
Cold prewarm: <= 10-20 Spotify Search calls/user
MusicBrainz: <= 1 request/sec globally
Last.fm: mostly cache hits; no repeated topAlbums calls inside TTL
```

---

## 1. Current external API map

### 1.1 Spotify

Current code paths:

| Code path | Endpoint | Trigger | Risk |
|---|---|---|---|
| `upsert-streaming-connection` | `/me` | OAuth callback | Needed, low volume |
| `refresh-spotify-token` / `getValidSpotifyToken` | `accounts.spotify.com/api/token` | token expiry | Needed, low volume unless functions loop |
| `sync-spotify-library` | `/me/albums`, `/me/tracks` | initial/manual/auto sync | Page-heavy for large libraries |
| `spotify-extended.searchAlbum` | `/search?type=album` | candidate resolution | Highest risk; current failure source |
| `spotify-extended.fetchAlbumDetails` | `/albums/{id}` | details/duration for selected/ambiguous albums | Moderate; should be rare |
| `fetchRelatedArtistsOptional` | `/artists/{id}/related-artists` | optional candidate expansion | Optional and unavailable in some modes |
| `fetchUserTopTracksOptional` / audio features | `/me/top/tracks`, `/audio-features` | taste vector path | Currently avoided in compute via `includeTasteVector: false` |

Relevant official docs:

- Spotify rate limits are app-wide and calculated over a rolling 30-second window.
- Spotify recommends backoff with `Retry-After`, batch APIs, lazy loading, and request-pattern logging.
- Development Mode has lower limits; Extended Quota has higher limits but stricter approval requirements.

Sources:

- https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes

### 1.2 Last.fm

Current code paths:

| Code path | Endpoint | Trigger | Risk |
|---|---|---|---|
| `getLastfmSimilarCached` | `artist.getsimilar` | source artist expansion | Cached for 30 days |
| `fetchTopAlbumsForArtist` | `artist.gettopalbums` | every similar artist candidate pass | Not globally cached yet |
| `fetchAlbumInfo` | `album.getinfo` | prewarm metadata enrichment | Optional but can multiply calls |
| `fetchGloballyTopAlbums` | `chart.gettopartists` + `artist.gettopalbums` | curated fallback prewarm | Batch-heavy but scheduled |

Relevant docs:

- Last.fm asks clients to avoid excessive usage and warns that accounts may be suspended for continuously making several calls per second.
- Last.fm requests should include a meaningful User-Agent.

Source:

- https://www.last.fm/api/intro

### 1.3 MusicBrainz

Current code paths:

| Code path | Endpoint | Trigger | Risk |
|---|---|---|---|
| `getReleaseGroupCached` | `/ws/2/release-group` | candidate validation | Already cached for 180 days |
| `validateCandidateWithMb` | same | post-scoring chosen candidate | Good current pattern |

Relevant docs:

- MusicBrainz rate-limits by IP and currently expects about 1 request per second.
- MusicBrainz strongly recommends meaningful User-Agent strings.
- MusicBrainz warns against synchronized scheduled workloads.

Source:

- https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

### 1.4 Supabase function self-calls

Current code paths:

| Code path | Function | Trigger | Risk |
|---|---|---|---|
| `sync-spotify-library` -> `prewarm-user-candidates` | fire-and-forget | sync completion | Good, but can amplify Spotify calls |
| `sync-spotify-library` -> `compute-album-of-the-day` | fire-and-forget | sync completion | Good if prewarm succeeds |
| pg_cron -> prewarm functions | scheduled | nightly | Needs jitter/batching |
| `dispatch-daily-picks` -> compute | scheduled | daily | Must remain compute-cache-first |

Supabase self-calls are not the external quota problem by themselves. The problem is when they indirectly trigger Spotify/Last.fm/MB cascades.

---

## 2. Design principles

1. **No live Spotify Search in the normal compute path.**
   `compute-album-of-the-day` should read local DB and only use live recovery as an emergency path.

2. **Resolve metadata once, reuse globally.**
   `(artist, album) -> Spotify album` is not user-specific. Cache it globally.

3. **Negative cache matters.**
   `no_match`, `bad_match`, and `rate_limited` outcomes are as important to cache as successful Spotify IDs.

4. **Score before expensive resolution.**
   Last.fm can produce a wide text-only pool. Spotify should only resolve the short list.

5. **Rate limits must be distributed, not only in-memory.**
   Edge Functions can run in multiple instances. A module-level `lastCallAt` is not enough.

6. **Partial progress is valuable.**
   Prewarm should save partial candidates and continue later instead of failing all-or-nothing.

7. **Fail closed for external APIs.**
   When Spotify is rate-limited, pause Spotify Search. Do not retry aggressively.

8. **Keep ratings out of recommendations.**
   These optimizations must not introduce rating-derived algorithm signals.

---

## 3. Implementation phases

### Phase 0 - Observability and safety rails

Goal: know exactly which endpoint is burning quota before optimizing deeper.

#### 0.1 Add API request log table

Migration:

```sql
create table public.external_api_request_log (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('spotify', 'lastfm', 'musicbrainz')),
  endpoint text not null,
  status integer,
  ok boolean not null,
  duration_ms integer,
  retry_after_seconds integer,
  error_code text,
  request_context text,
  user_id uuid,
  created_at timestamptz not null default now()
);

create index external_api_request_log_recent_idx
  on public.external_api_request_log(service, endpoint, created_at desc);

create index external_api_request_log_user_recent_idx
  on public.external_api_request_log(user_id, created_at desc)
  where user_id is not null;

alter table public.external_api_request_log enable row level security;
revoke all on public.external_api_request_log from anon, authenticated;
```

Notes:

- Service-role only.
- Do not log tokens, raw URLs with query payloads, callback codes, or auth headers.
- For Spotify Search, log normalized endpoint as `search_album`, not the exact query.
- Keep this table small with retention, e.g. delete rows older than 30 days.

#### 0.2 Add health views

Views:

```sql
create or replace view public.v1_external_api_health as
select
  date_trunc('hour', created_at) as hour,
  service,
  endpoint,
  count(*) as calls,
  count(*) filter (where not ok) as failures,
  count(*) filter (where status = 429) as rate_limited,
  round(avg(duration_ms)) as avg_duration_ms
from public.external_api_request_log
where created_at > now() - interval '7 days'
group by 1, 2, 3
order by 1 desc, 2, 3;
```

Use via service role / Dashboard SQL.

#### 0.3 Wrap external fetches with logging

Implement shared helpers:

- `recordExternalApiCall(admin, event)`
- `safeRetryAfterSeconds(res)`
- `normalizeApiError(e)`

Touch:

- `supabase/functions/_shared/spotify.ts`
- `supabase/functions/_shared/spotify-extended.ts`
- `supabase/functions/_shared/lastfm.ts`
- `supabase/functions/_shared/musicbrainz.ts`

Acceptance:

- Manual prewarm produces API log rows.
- No secrets in logs.
- `v1_external_api_health` shows Spotify 429s if they happen.

Risks:

- Logging every successful request can add DB writes. If overhead is too high, sample successes and always log failures.

---

### Phase 1 - Spotify album resolution cache

Goal: never repeat the same Spotify Search for the same normalized `(artist, album)`.

#### 1.1 Add `spotify_album_resolution_cache`

Migration:

```sql
create table public.spotify_album_resolution_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_artist text not null,
  normalized_album text not null,
  requested_artist text not null,
  requested_album text not null,
  spotify_album_id text,
  status text not null check (status in (
    'resolved',
    'no_match',
    'bad_match',
    'rate_limited',
    'spotify_unavailable'
  )),
  result jsonb,
  failure_status integer,
  failure_detail text,
  fetched_at timestamptz not null default now(),
  next_retry_at timestamptz,
  unique (normalized_artist, normalized_album)
);

create index spotify_album_resolution_status_retry_idx
  on public.spotify_album_resolution_cache(status, next_retry_at);

create index spotify_album_resolution_spotify_album_idx
  on public.spotify_album_resolution_cache(spotify_album_id)
  where spotify_album_id is not null;

alter table public.spotify_album_resolution_cache enable row level security;
revoke all on public.spotify_album_resolution_cache from anon, authenticated;
```

#### 1.2 Replace direct `searchAlbum` calls

Add:

```ts
resolveSpotifyAlbumCached(admin, token, artist, album, opts)
```

Behavior:

- Normalize artist/album using the same logic as search matching.
- If `resolved` and fresh: return cached album.
- If `no_match` and fresh: return `null`.
- If `bad_match` and fresh: return `null`.
- If `rate_limited` and `next_retry_at > now`: throw `spotify_search_circuit_open` or return a typed unavailable result.
- If stale or retryable: call Spotify Search.

Recommended TTLs:

| Status | TTL / retry |
|---|---|
| `resolved` | 90 days |
| `no_match` | 30 days |
| `bad_match` | 90 days |
| `rate_limited` | `Retry-After`, then exponential up to 24h |
| `spotify_unavailable` | 1 day |

#### 1.3 Ensure candidate cache uses resolution cache

Touch:

- `supabase/functions/_shared/candidate-generation.ts`
- `supabase/functions/prewarm-user-candidates/index.ts`
- `supabase/functions/prewarm-album-cache/index.ts`

Acceptance:

- Re-running prewarm for the same user with `force: true` should perform far fewer Spotify Search calls.
- `spotify_album_resolution_cache` should fill with both `resolved` and `no_match`.
- Spotify `429` should create/update `rate_limited` rows.

Risks:

- Bad normalization can merge distinct albums. Keep `requested_artist` / `requested_album` for audit.
- Spotify search results can vary by market. Include `market` in unique key if we start using non-US market-specific behavior.

---

### Phase 2 - Spotify circuit breaker

Goal: if Spotify Search is rate-limited, stop making Spotify Search worse.

#### 2.1 Add `external_api_circuit_breakers`

Migration:

```sql
create table public.external_api_circuit_breakers (
  service text not null,
  endpoint text not null,
  state text not null check (state in ('closed', 'open', 'half_open')),
  opened_at timestamptz,
  cooldown_until timestamptz,
  last_status integer,
  last_error text,
  failure_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (service, endpoint)
);

alter table public.external_api_circuit_breakers enable row level security;
revoke all on public.external_api_circuit_breakers from anon, authenticated;
```

#### 2.2 Implement breaker semantics

For `spotify:search_album`:

- On first `429`: open for `Retry-After` if present, minimum 15 minutes in Development Mode.
- On repeated `429`: open for 1 hour, then 4 hours, then 24 hours.
- While open: `prewarm-user-candidates` saves partial candidates and returns `partial` or `skipped`.
- `compute-album-of-the-day` should not live-recover via Spotify while breaker is open; use cache/fallback.
- Half-open: allow one probe request. If it succeeds, close. If it fails, reopen.

Implementation approach:

- Use an RPC with `pg_advisory_xact_lock` to atomically read/update breaker state.
- Do not detach `supabase.rpc`; call inline per repo convention.

Acceptance:

- After a Spotify 429 cascade, subsequent prewarm calls do not call Spotify Search until cooldown ends.
- Response includes `reason: "spotify_search_circuit_open"` instead of repeating 429s.

Risks:

- Too-conservative breaker delays fresh recommendations. Mitigation: compute uses cached candidates/fallback; prewarm retries later.

---

### Phase 3 - Late Spotify binding

Goal: reduce cold prewarm Spotify Search from "all possible candidates" to "top K candidates".

#### 3.1 Split candidate generation into two stages

Add types:

```ts
type TextCandidate = {
  source_artist_key: string;
  source_artist_name: string;
  candidate_artist_name: string;
  candidate_album_name: string;
  lastfm_playcount?: number;
  similarity_match: number;
  source_paths: ...
};
```

Stage A:

- Last.fm `artist.getSimilar`
- Last.fm `artist.getTopAlbums`
- Normalize and dedupe text candidates
- Apply library/history normalized artist+album exclusions
- Pre-score text candidates

Stage B:

- Take top K text candidates, e.g. 20.
- Resolve through `spotify_album_resolution_cache`.
- Insert eligible rows into `recommendation_candidates`.

#### 3.2 Scoring before Spotify

Initial text score:

```text
0.55 * best_similarity
+ 0.30 * source_artist_frequency_log
+ 0.15 * lastfm_playcount_log_percentile
```

No genre taxonomy. No ratings.

#### 3.3 Config knobs

Recommended defaults:

```ts
source_artist_limit = 20
max_similar_per_source = 8
max_top_albums_per_similar = 2
spotify_resolution_top_k = 20
spotify_resolution_min_k = 5
```

For manual QA / Development Mode:

```ts
source_artist_limit = 3-5
spotify_resolution_top_k = 5-10
```

Acceptance:

- Cold prewarm calls Spotify Search at most K times per user.
- If K candidates all fail/no-match, prewarm returns partial/failed without exhausting the entire similar graph.
- Candidate quality remains acceptable in manual QA.

Risks:

- Good niche candidates may be below top K. Mitigation: use randomness/temperature in text-stage top K, e.g. choose from top 40 with weighted sampling.

---

### Phase 4 - Last.fm top albums cache

Goal: avoid repeated `artist.getTopAlbums` calls for the same similar artists.

#### 4.1 Add `lastfm_artist_top_albums_cache`

Migration:

```sql
create table public.lastfm_artist_top_albums_cache (
  normalized_artist text primary key,
  artist_name text not null,
  top_albums jsonb not null,
  fetched_at timestamptz not null default now()
);

create index lastfm_artist_top_albums_fetched_idx
  on public.lastfm_artist_top_albums_cache(fetched_at);

alter table public.lastfm_artist_top_albums_cache enable row level security;
revoke all on public.lastfm_artist_top_albums_cache from anon, authenticated;
```

TTL:

- 30 days default.
- 7 days if candidate quality looks stale.

#### 4.2 Replace `fetchTopAlbumsForArtist`

Add:

```ts
getLastfmTopAlbumsCached(admin, artistName, limit)
```

Rules:

- Cache full list up to configured max, not just the requested `limit`.
- If Last.fm fails and cache exists but stale, return stale cache with `stale: true`.
- Only throw if no cache exists and Last.fm fails.

Acceptance:

- Second prewarm run for same/similar library calls Last.fm far less.
- Last.fm failures can still produce candidates from stale cache.

Risks:

- Last.fm top albums can include noisy pseudo-releases. Existing release eligibility / Spotify resolution still filters.

---

### Phase 5 - Distributed API limiter

Goal: make throttling work across Edge Function instances.

#### 5.1 Add `external_api_rate_limits`

Migration:

```sql
create table public.external_api_rate_limits (
  service text not null,
  endpoint text not null,
  next_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service, endpoint)
);

alter table public.external_api_rate_limits enable row level security;
revoke all on public.external_api_rate_limits from anon, authenticated;
```

#### 5.2 Add RPC

```sql
create or replace function public.reserve_external_api_slot(
  p_service text,
  p_endpoint text,
  p_interval_ms integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_next timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_service || ':' || p_endpoint));

  insert into public.external_api_rate_limits(service, endpoint, next_allowed_at)
  values (p_service, p_endpoint, v_now)
  on conflict (service, endpoint) do nothing;

  select next_allowed_at into v_next
  from public.external_api_rate_limits
  where service = p_service and endpoint = p_endpoint
  for update;

  update public.external_api_rate_limits
  set
    next_allowed_at = greatest(v_now, v_next) + make_interval(secs => p_interval_ms / 1000.0),
    updated_at = v_now
  where service = p_service and endpoint = p_endpoint;

  return greatest(v_now, v_next);
end;
$$;
```

Intervals:

| Service endpoint | Interval |
|---|---:|
| `musicbrainz:release_group_search` | 1100ms |
| `lastfm:any` | 300-500ms |
| `spotify:search_album` | 1000-3000ms in dev mode |
| `spotify:paged_library` | 500-1000ms if rate limits persist |

Implementation notes:

- `reserve_external_api_slot` returns when the request may run; the Edge Function sleeps until that timestamp.
- Keep in-memory throttle as a cheap local layer, but DB limiter is authoritative.

Acceptance:

- Parallel prewarm jobs cannot exceed configured request cadence.
- MusicBrainz never receives more than 1 request/sec from the project under normal code paths.

Risks:

- DB round-trip before each external call adds latency. Mitigation: only apply DB limiter to high-risk endpoints first (`spotify:search_album`, `musicbrainz`).

---

### Phase 6 - Spotify sync optimization

Goal: keep library data fresh without page-heavy sync loops.

#### 6.1 Separate initial full sync from maintenance sync

Initial sync:

- Full `/me/albums`
- Full `/me/tracks`
- Reconcile removals
- Trigger prewarm

Maintenance sync:

- Run at most once per 24h automatically.
- Fetch first N pages only, default 2-5 pages each for albums/tracks.
- Do not soft-delete missing rows during bounded sync.
- Full reconcile only on manual user action or weekly cron.

#### 6.2 Add sync mode

Function payload:

```json
{
  "mode": "initial" | "bounded" | "full_reconcile"
}
```

Rules:

- OAuth first sync uses `initial`.
- AuthProvider stale auto-sync uses `bounded`.
- Profile manual sync can use `full_reconcile`, but respect cooldown.

#### 6.3 Stronger cooldowns

Current failed cooldown is 15 minutes. Recommended:

- `failed` due to Spotify 429: 60 minutes.
- `failed` due to auth: no auto retry; require reconnect.
- `completed`: no auto sync for 24h.
- manual sync button disabled while `queued/syncing` and for short cooldown after completion.

Acceptance:

- App restore does not trigger full library sync repeatedly.
- Spotify page calls drop significantly for existing users.

Risks:

- Bounded sync may miss removals. Acceptable because recommendation exclusions can be slightly conservative; full reconcile fixes later.

---

### Phase 7 - Cron jitter and queueing

Goal: prevent synchronized API spikes.

#### 7.1 Replace single large nightly batch with small batches

Instead of:

```text
02:30 UTC -> prewarm 25 users
```

Use:

```text
Every 15 minutes between 02:00 and 06:00 UTC -> prewarm up to 3 users
```

Or keep one cron but select users with randomized ordering:

```sql
order by random()
limit 3
```

Better long-term:

- `candidate_prewarm_jobs` table.
- Job states: `queued`, `running`, `completed`, `failed`, `deferred`.
- Worker claims one job using `for update skip locked`.

#### 7.2 Respect service circuit breakers in scheduler

If `spotify:search_album` breaker is open:

- Do not start new Spotify-heavy prewarm jobs.
- Allow cache-only compute.
- Allow Last.fm-only text candidate expansion if it saves text candidates separately.

Acceptance:

- No API spike at exact cron minute.
- Failed/rate-limited jobs become deferred, not repeatedly retried.

Risks:

- More moving parts. Keep this after cache/circuit breaker unless cron itself becomes the main problem.

---

## 4. Recommended implementation order

### Batch 1 - Immediate stability

1. Add API request log + health view.
2. Add Spotify album resolution cache.
3. Route `searchAlbum` through cache.
4. Add negative caching for `no_match` and `rate_limited`.
5. Deploy and manually test one user.

Why first:

- Directly addresses observed `spotify_search_failed`.
- Lowers repeated Spotify Search without changing recommendation scoring.

### Batch 2 - Stop cascades

1. Add `external_api_circuit_breakers`.
2. Open circuit on repeated Spotify 429.
3. Make `prewarm-user-candidates` return `partial/skipped` when circuit is open.
4. Make compute live recovery skip Spotify Search when circuit is open.

Why second:

- Prevents one manual retry from extending the outage.

### Batch 3 - Structural reduction

1. Split candidate generation into text candidates and resolved candidates.
2. Add late Spotify binding top K.
3. Keep candidate cache write-back.
4. Tune K in Development Mode.

Why third:

- Bigger algorithm touch; do after cache and breaker are visible.

### Batch 4 - Last.fm reduction

1. Add Last.fm top albums cache.
2. Allow stale cache fallback.
3. Add metrics for Last.fm cache hit rate.

Why fourth:

- Important, but Spotify is currently the production blocker.

### Batch 5 - Distributed limiters and sync cadence

1. Add `reserve_external_api_slot`.
2. Apply first to MusicBrainz and Spotify Search.
3. Add sync modes and bounded maintenance sync.
4. Add cron jitter / job queue if needed.

Why fifth:

- More infrastructure; best done after request volume is already lower.

---

## 5. Concrete code touch points

### Shared modules

Create:

- `supabase/functions/_shared/external-api-log.ts`
- `supabase/functions/_shared/external-api-breaker.ts`
- `supabase/functions/_shared/external-api-rate-limit.ts`
- `supabase/functions/_shared/spotify-album-resolution-cache.ts`
- `supabase/functions/_shared/lastfm-top-albums-cache.ts`

Modify:

- `supabase/functions/_shared/spotify-extended.ts`
- `supabase/functions/_shared/spotify.ts`
- `supabase/functions/_shared/lastfm.ts`
- `supabase/functions/_shared/musicbrainz.ts`
- `supabase/functions/_shared/candidate-generation.ts`
- `supabase/functions/_shared/candidate-cache.ts`

### Edge Functions

Modify:

- `supabase/functions/prewarm-user-candidates/index.ts`
- `supabase/functions/compute-album-of-the-day/index.ts`
- `supabase/functions/prewarm-album-cache/index.ts`
- `supabase/functions/sync-spotify-library/index.ts`
- `supabase/functions/dispatch-daily-picks/index.ts` if scheduling/batching changes are needed

### Migrations

Add in separate migrations, not one mega-migration:

1. `external_api_request_log` + health view.
2. `spotify_album_resolution_cache`.
3. `external_api_circuit_breakers`.
4. `lastfm_artist_top_albums_cache`.
5. `external_api_rate_limits` + reservation RPC.
6. Optional `candidate_prewarm_jobs`.

---

## 6. QA workflow

### 6.1 Before deploying optimization

Run current baseline for one test user:

```bash
curl -X POST 'https://PROJECT_REF.supabase.co/functions/v1/prewarm-user-candidates' \
  -H 'Authorization: Bearer CRON_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"USER_UUID","source_artist_limit":5,"force":true,"diag":true}'
```

Record:

- candidate count
- `status`
- diag stages
- Spotify failures
- duration

### 6.2 After Batch 1

Run same command twice.

Expected:

- First run may call Spotify.
- Second run should mostly hit `spotify_album_resolution_cache`.
- `external_api_request_log` should show fewer Spotify Search calls on second run.

SQL:

```sql
select status, count(*)
from public.spotify_album_resolution_cache
group by 1
order by 1;
```

```sql
select *
from public.v1_external_api_health
where service = 'spotify'
order by hour desc, endpoint;
```

### 6.3 After Batch 2

Force a small run during/after rate limit.

Expected:

- Breaker opens.
- Further calls return `spotify_search_circuit_open` or skip live search.
- No repeated Spotify Search calls while cooldown is active.

### 6.4 After Batch 3

Inspect per-user prewarm:

Expected:

- `similar_pool_ready` may still be large.
- Spotify resolution attempts capped at top K.
- Candidate quality still acceptable.

### 6.5 Compute acceptance

For warm cache:

```bash
curl -X POST 'https://PROJECT_REF.supabase.co/functions/v1/compute-album-of-the-day' \
  -H 'Authorization: Bearer CRON_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"USER_UUID","diag":true}'
```

Expected:

- `is_fallback: false`
- `cache_candidates_ready` count >= 30 ideally
- no live Spotify Search unless cache pool is too small and breaker is closed

---

## 7. Failure modes and mitigations

| Failure mode | Cause | Mitigation |
|---|---|---|
| Spotify Search returns 429 repeatedly | Development Mode rolling window exceeded | Circuit breaker + long cooldown + negative cache |
| Spotify Search returns 403 | user/app mode or endpoint restriction | Treat as unavailable; do not retry aggressively |
| Cached `no_match` hides a later valid result | Spotify catalog changes | TTL 30 days; manual `force` can ignore stale cache |
| Bad match cached as resolved | Search matching too loose | Store result JSON; add QA query; allow status override later |
| Last.fm returns noisy top albums | Last.fm data quality | Keep release eligibility + Spotify match checks |
| MusicBrainz throttles with 503 | Global/IP rate | DB limiter 1100ms + meaningful User-Agent |
| Edge instances bypass in-memory throttle | Multiple concurrent functions | DB-backed limiter/RPC |
| Logging creates DB write overhead | Every request logs success | Sample successes; always log failures |
| Bounded sync misses removals | Maintenance sync does not reconcile | Weekly/manual full reconcile |
| Cron still spikes requests | Too many users in one invocation | small batches + jitter + job queue |
| Partial prewarm creates too-small "fresh" cache | Some candidates saved before failure | Freshness requires >= 30 eligible candidates |

---

## 8. Metrics to track

Core:

- Spotify Search calls per prewarm user.
- Spotify Search 429 count per hour.
- Candidate cache eligible rows per active user/source artist set.
- `compute-album-of-the-day` fallback percentage.
- Warm compute median wall time.

Secondary:

- Last.fm `artist.getTopAlbums` cache hit rate.
- MusicBrainz calls per hour.
- Library sync pages fetched per user.
- Prewarm statuses: `warmed`, `partial`, `failed`, `skipped_fresh`, `skipped_circuit_open`.

Target thresholds:

| Metric | Target |
|---|---:|
| Warm compute Spotify Search calls | 0 |
| Warm compute median wall time | < 3s |
| Fallback rate after warm cache | < 10% |
| Cold prewarm Spotify Search calls | <= 20/user |
| Mature prewarm Spotify Search calls | <= 5/user |
| MusicBrainz cadence | <= 1 req/sec globally |

---

## 9. Deployment plan

For each batch:

1. Add migration.
2. Run:

```bash
PATH=/opt/homebrew/bin:$PATH npm run db:push
PATH=/opt/homebrew/bin:$PATH npm run db:types
```

3. Deploy changed functions:

```bash
PATH=/opt/homebrew/bin:$PATH supabase functions deploy prewarm-user-candidates
PATH=/opt/homebrew/bin:$PATH supabase functions deploy compute-album-of-the-day
PATH=/opt/homebrew/bin:$PATH supabase functions deploy sync-spotify-library
```

Deploy only functions touched in that batch.

4. Run manual QA for one user.
5. Inspect health SQL.
6. Wait at least one nightly cycle before starting the next batch unless the batch fixes a blocking bug.

Order matters:

- Schema before functions.
- Types after schema.
- Breaker/cache helpers before functions that call them.

---

## 10. Rollback plan

Safe rollback levers:

- Disable live recovery in compute by config/env if Spotify becomes unstable.
- Set prewarm source artist limit low in manual QA.
- Pause nightly prewarm cron.
- Open `spotify:search_album` breaker manually for a cooldown window.
- Fall back to existing curated fallback if candidate cache is thin.

Do not rollback by dropping cache tables immediately. They are additive and can be left unused while functions are reverted.

---

## 11. Final recommendation

Implement in this order:

1. `spotify_album_resolution_cache` with negative caching.
2. `external_api_circuit_breakers` for Spotify Search.
3. Late Spotify binding top K.
4. Last.fm top albums cache.
5. DB-backed distributed limiter.
6. Sync modes and cron jitter.

This order attacks the actual observed failure first, lowers repeated Spotify Search quickly, and avoids a broad rewrite before we have API health telemetry. The north star is simple: **Spotify Search becomes an occasional background resolution detail, not a dependency of daily recommendation compute.**

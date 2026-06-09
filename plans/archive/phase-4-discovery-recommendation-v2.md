# Phase 4 extension — Discovery recommendation v2 (cache-first, tier-aware)

> **Status:** plan, not yet implemented. Supersedes pure phase-4 scoring for production. Master-plan phase 6 (design system + rich Profile) remains untouched.
> **Date:** 2026-05-26 (revised 2026-05-26 after scope review).
> **Why this exists:** manual QA on a real Spotify library produced **10/10 picks with `is_fallback = true`**. The user has not yet observed primary algorithm output; they have only observed curated fallback. This plan fixes that, then improves discovery quality.

---

## 0. Diagnosis

| Observation | Implication |
|---|---|
| All 10 recent manually-recomputed picks had `is_fallback = true` | Primary candidate generation fails reliably under real-world API load (Spotify `/search` 429/timeout, MB rate-limit, etc.) |
| Fallback reads `albums.is_prewarm_seed = true` ordered by Last.fm listeners | Fallback is globally-popular by construction; for a niche/underground library it picks mainstream pseudo-relevant albums |
| Phase 4 scoring uses raw `popularity_log_percentile` as positive boost | Even when primary works, popular candidates dominate; no explicit discovery tiers |
| Singles/compilations are excluded but mainstream studio albums by popular artists are not | "Top albums by famous artists" is not the product goal |

**Conclusion:** two distinct problems, often conflated. Fix them in order, not together.

1. **Reliability** — primary path fails too often → fallback dominates.
2. **Discovery quality** — even when primary succeeds, scoring biases toward "familiar/popular adjacent" rather than "interesting/unfamiliar adjacent".

---

## 1. Goals & non-goals

### Product goal

The pick should feel like:
> *"This app understands the shape of my library and gives me one album I probably haven't saved, but that makes sense as a discovery."*

It should not feel like:
> *"This app finds the most famous artist connected to my music graph."*

### Non-goals (preserved from previous phases)

- Ratings stay personal-journal only; algorithm reads only `user_library` + `recommendation_history`.
- No genre taxonomy ranking.
- No social/friends signals.
- No skip mechanic.
- No mandatory onboarding taste questions.
- No LLM in daily compute path.

---

## 2. Two-track rollout (sequential, NOT parallel)

This is the most important structural decision in this plan. **Track A and Track B are deployed and validated separately**, so we can attribute changes to causes.

```
┌─────────────────────────────────────────────────────────────────┐
│  Track A — Reliability (cache-first compute)                    │
│    Goal: bring is_fallback rate from ~100% → < 10%              │
│    No scoring changes. Same phase-4 weights.                    │
│    Deploy → observe 5–7 days on real library                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (gate: fallback rate measured, primary picks observed)
┌─────────────────────────────────────────────────────────────────┐
│  Track B — Discovery scoring (tiers + buckets)                  │
│    Goal: make primary picks feel like deliberate discoveries    │
│    Tier classifier + popularity buckets + minimal scoring patch │
│    Deploy → observe 5–7 days → iterate                          │
└─────────────────────────────────────────────────────────────────┘
```

If after Track A primary picks look reasonable, Track B can ship in a smaller form (only mainstream penalty + known-artist bonus, no full scoring rewrite). The decision is data-driven, not pre-committed.

---

## 3. Track A — Cache-first compute (Reliability)

### 3.1. Architecture change

Primary `compute-album-of-the-day` currently does live external lookups during the request:
- Last.fm `artist.getSimilar` per source artist (cached)
- Last.fm `artist.getTopAlbums` per similar artist
- Spotify `/search?type=album` per (similar artist, top album) — **the brittle one**
- MB release-group lookup per candidate

The Spotify search dominates failure modes (rate limit, 429s, timeout) because it's done many times per compute. We move all the resolution off the hot path into a pre-resolved cache.

```
PREWARM (async, runs ahead of compute):
  for each active user:
    for each top-N source artist:
      Last.fm similar → top albums → Spotify search → MB filter
      → write rows into recommendation_candidates with eligibility_status

COMPUTE (fast, cache-only normally):
  read recommendation_candidates joined with user's top source artists
  → filter via user_library / recommendation_history / recent artists
  → score (existing phase-4 weights in Track A; new weights in Track B)
  → select
  → if cache pool < min threshold → fall through to bounded live recovery
  → if still < min → curated fallback
```

### 3.2. New table — `recommendation_candidates`

```sql
create table public.recommendation_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('lastfm', 'spotify')),
  source_artist_key text not null,                   -- same flexible-key scheme as artist_similarity_cache
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
  popularity_bucket text,                            -- written at prewarm time (consistent across reads)
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
  resolved_at timestamptz,                           -- when we last successfully resolved metadata
  fetched_at timestamptz not null default now(),
  next_retry_at timestamptz,                         -- for unresolved retry policy
  unique (source, source_artist_key, candidate_artist_name, candidate_album_name)
);

-- Read-side indexes.
create index recommendation_candidates_source_artist_eligible_idx
  on public.recommendation_candidates(source_artist_key, eligibility_status)
  where eligibility_status = 'eligible';

create index recommendation_candidates_spotify_album_idx
  on public.recommendation_candidates(spotify_album_id)
  where spotify_album_id is not null;

-- Additional strict dedup on resolved candidates: same album shouldn't be stored
-- multiple times for the same source artist with different text spellings.
create unique index recommendation_candidates_strict_resolved_idx
  on public.recommendation_candidates(source_artist_key, spotify_album_id)
  where spotify_album_id is not null;

-- Stale-retry index for prewarm scheduler.
create index recommendation_candidates_retry_idx
  on public.recommendation_candidates(next_retry_at)
  where eligibility_status in ('unresolved', 'spotify_unavailable');

alter table public.recommendation_candidates enable row level security;
revoke all on public.recommendation_candidates from anon, authenticated;
-- service role only.
```

### 3.3. Source aggregation semantics (important, was implicit in original plan)

The same album can be a candidate for multiple of a user's source artists. The table stores **one row per (source_artist, candidate_album)** pair. At compute time we **aggregate** by `spotify_album_id`:

```ts
type AggregatedCandidate = {
  spotify_album_id: string;
  candidate_artist_name: string;
  cover_url: string | null;
  // ... other album metadata (same across rows for same album)
  source_paths: { source_artist_key: string; source_artist_name: string; similarity_match: number }[];
  best_similarity: number;          // max(source_paths.similarity_match)
  source_artist_count: number;      // distinct source_artist_key count
  source_artist_strength_sum: number; // sum of source artists' library frequencies
};
```

`source_artist_count` is the **multi-source-affinity signal** — albums reachable from many of the user's artists are stronger candidates than albums reachable from one.

### 3.4. New Edge Function — `prewarm-user-candidates`

```
POST /functions/v1/prewarm-user-candidates
Auth: Bearer <CRON_SECRET>
Body:
  {
    "user_id": "uuid optional — warm only this user",
    "limit_users": 25,                  // when user_id missing, max users per invocation
    "source_artist_limit": 20,          // top-N source artists per user
    "force": false,                     // ignore freshness checks
    "diag": true
  }
```

**Concrete prewarm scheduling (decided here, not deferred):**

| Trigger | When | What |
|---|---|---|
| **On `library_sync_status → 'completed'`** | sync-spotify-library fires fire-and-forget into prewarm for the user | Warms candidates before the user sees their first AOTD |
| **Nightly (cron, 02:30 UTC)** | refresh users whose newest `recommendation_candidates.fetched_at` is older than **7 days** | Keeps cache fresh as similar-artists graph evolves |
| **On unresolved retry** | `next_retry_at <= now()` AND `eligibility_status in ('unresolved', 'spotify_unavailable')` | Retry stuck rows; set `next_retry_at = now() + 7 days` on each retry |

**Concurrency / rate respect:**

- Process users sequentially within a single invocation; concurrency limit 1.
- Within a user, throttle Spotify search to 1 req/200ms (same as Last.fm helper).
- Each unresolved candidate gets `next_retry_at = now() + 7 days`; never retry same row sooner than that.

### 3.5. Cache-first `compute-album-of-the-day` changes

```
1. Validate auth (existing).
2. Idempotency check (existing).
3. extractTasteSignal (existing).
4. NEW: load eligible candidates from cache:
     SELECT * FROM recommendation_candidates
     WHERE source_artist_key IN (top source artists of user)
       AND eligibility_status = 'eligible'
5. NEW: aggregate by spotify_album_id (see §3.3).
6. Apply exclusions (library, recommendation_history, recent 30-day artists).
7. If aggregated eligible pool < MIN_POOL_SIZE (= 30):
     → bounded live generation for up to 5 source artists (existing logic, time-budgeted)
     → write any new resolved candidates back into recommendation_candidates
8. If still < MIN_LIVE_POOL_SIZE (= 5):
     → curated fallback (existing; demoted but kept)
9. Score (Track A: existing phase-4 weights; Track B: new tier-aware).
10. Select, upsert albums, ensure_recommendation_atomic (existing).
```

**Wall-time budget:** with cache hit the whole compute should be < 3s. Live recovery adds at most 10s. Fallback is instant. The 60s Edge Function ceiling is comfortable.

### 3.6. Operational visibility

Single SQL view (not a new table — avoids overhead for v1):

```sql
create or replace view public.v1_fallback_health as
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
-- view inherits caller's RLS on albums_of_the_day (select_own); for ops monitoring
-- query via service role in SQL editor to see all users.
```

Open in Supabase Dashboard daily during Track A observation phase.

### 3.7. Track A acceptance

- For a healthy library with prewarm complete, **10 manual recomputes yield ≥ 8 primary picks**.
- `v1_fallback_health` shows daily `fallback_pct < 10%` for active users.
- `compute-album-of-the-day` median wall-time < 5s when cache is warm.
- No scoring changes deployed yet — picks may still feel popularity-biased; that's expected and addressed by Track B.

---

## 4. Track B — Discovery scoring (only after Track A is healthy)

### 4.1. Candidate tier classifier (pure function, tested)

```ts
export type CandidateTier =
  | 'known_artist_new_album'
  | 'adjacent_artist'
  | 'deep_discovery'
  | 'safe_anchor';

export function classifyCandidate(
  candidate: AggregatedCandidate,
  userArtistFrequencies: Map<string, number>,    // normalized artist name → freq
  bucket: PopularityBucket,
): CandidateTier {
  const artistKey = normalize(candidate.candidate_artist_name);
  const libraryFreq = userArtistFrequencies.get(artistKey) ?? 0;

  // Known-artist threshold: ≥ 2 appearances in user_library (decided here, not deferred).
  if (libraryFreq >= 2) return 'known_artist_new_album';

  if (bucket === 'mainstream') return 'safe_anchor';
  if (bucket === 'deep' && candidate.best_similarity >= 0.6) return 'deep_discovery';

  return 'adjacent_artist';
}
```

### 4.2. Popularity buckets (concrete thresholds, not deferred)

Initial thresholds based on Last.fm listeners; refine after observing real data:

```ts
export type PopularityBucket = 'unknown' | 'deep' | 'niche' | 'known' | 'mainstream';

export function popularityBucket(listeners: number | null | undefined): PopularityBucket {
  if (listeners == null) return 'unknown';
  if (listeners < 10_000) return 'deep';
  if (listeners < 100_000) return 'niche';
  if (listeners < 1_000_000) return 'known';
  return 'mainstream';
}
```

These are **stored on `recommendation_candidates.popularity_bucket` at prewarm time** so the value is consistent and queryable. Recomputed only on re-resolve (every 7 days or on explicit refresh).

### 4.3. Minimal scoring patch (NOT a full rewrite)

I deliberately reject the bigger rewrite proposed in the original plan (new 6-factor formula). Instead: **keep existing phase-4 weights, add two adjustments.**

**Existing phase-4 score:**
```
0.45 · best_similarity
+ 0.20 · source_artist_frequency_log
+ 0.20 · popularity_log_percentile
+ 0.05 · release_balance
+ 0.10 · sampling_temperature
(+ optional 0.10 · audio_match_bonus)
```

**Track B patches:**

```ts
function trackBScore(c: ScoredCandidate, tier: CandidateTier, bucket: PopularityBucket): number {
  let score = c.score;  // phase-4 base

  // 1. Mainstream penalty: mainstream picks deserve to win only via safe_anchor.
  if (bucket === 'mainstream' && tier !== 'safe_anchor') {
    score *= 0.4;  // hard penalty
  }

  // 2. Known-artist-new-album bonus: bring back missing classics from artists user knows.
  if (tier === 'known_artist_new_album') {
    score *= 1.25;
  }

  // 3. Deep discovery bonus only when similarity is strong (already enforced in tier classifier).
  if (tier === 'deep_discovery') {
    score *= 1.10;
  }

  return score;
}
```

This is intentionally small. It's a multiplicative nudge on top of existing scoring, not a new formula. After Track B ships and we observe results for a week, we can decide whether to do a deeper rewrite or stop.

### 4.4. selection_reason additions

Extend the jsonb structure (additive, no breaking change):

```json
{
  "is_fallback": false,
  "primary_source_artist": "Nicolas Jaar",
  "secondary_source_artists": ["Actress"],
  "decade": "2010s",
  "lastfm_listeners": 84000,
  "score_breakdown": { ... existing ... },

  "candidate_tier": "adjacent_artist",
  "popularity_bucket": "niche",
  "source_artist_count": 3,
  "track_b_multipliers": { "mainstream_penalty": 1.0, "known_artist_bonus": 1.0, "deep_discovery_bonus": 1.0 }
}
```

UI keeps using the existing humorous human-line formatter; the new fields are for QA/SQL inspection.

### 4.5. Explicitly deferred from original plan

- **30-day target distribution enforcement** (original §B5: "25% known artist, 45% adjacent...") — too state-dependent, makes algorithm opaque, conflicts with simplicity. Existing 30-day artist-diversity guard already prevents same-artist repeats. Skip.
- **`user_candidate_cache_status` table** — replaced by `v1_fallback_health` view + querying `recommendation_candidates.fetched_at` directly. Less ceremony.
- **Per-tier scoring functions / completely new score formula** — replaced by multiplicative patches on existing scoring. Smaller blast radius.

### 4.6. Track B acceptance

- Manual QA: on a niche/underground test library, mainstream artists do NOT appear unless the source graph strongly justifies them.
- For users with ≥ 5 distinct artists in library, picks include **at least one** of `known_artist_new_album` or `deep_discovery` over a 14-day window (not every day, but visibly mixed).
- Tier classifier and bucket helper have deterministic unit tests passing.

---

## 5. Implementation order

| Step | Track | What |
|---|---|---|
| 1 | A | Add `recommendation_candidates` migration + indexes |
| 2 | A | Add `v1_fallback_health` view |
| 3 | A | Build `prewarm-user-candidates` Edge Function — reuses existing helpers (`getLastfmSimilarCached`, `fetchTopAlbumsForArtist`, `searchAlbum`, MB validation) |
| 4 | A | Wire prewarm into `sync-spotify-library` completion path (fire-and-forget) |
| 5 | A | Add nightly cron for prewarm refresh (Vault-secured, same pattern as existing `prewarm-album-cache`) |
| 6 | A | Update `compute-album-of-the-day` to cache-first read + aggregation + bounded live recovery |
| 7 | A | Deploy. **Observe 5–7 days.** Check `v1_fallback_health` daily. Decide if Track B is needed in full or trimmed. |
| 8 | B | Add `tier-classifier.ts` + `popularity-bucket.ts` pure modules with Deno tests |
| 9 | B | Compute popularity bucket at prewarm time (write into `recommendation_candidates.popularity_bucket`) |
| 10 | B | Add Track B multiplier patch into scoring |
| 11 | B | Extend `selection_reason` with `candidate_tier`, `popularity_bucket`, `source_artist_count`, multipliers |
| 12 | B | Deploy. Observe 5–7 days. SQL-inspect tier distribution and mainstream count. |

---

## 6. QA workflow

### 6.1. Recompute single user

`UNIQUE(user_id, date)` means we must delete first to re-test same day:

```sql
-- Wipe today's pick + history entry to allow recompute.
-- WARNING: only in dev. Don't run for real users in production.
with target as (
  select id, album_id from public.albums_of_the_day
  where user_id = 'USER_UUID'::uuid
    and date = (now() at time zone (select coalesce(timezone, 'UTC') from public.profiles where id = 'USER_UUID'::uuid))::date
)
delete from public.recommendation_history
  where (user_id, album_id) in (select 'USER_UUID'::uuid, album_id from target);
delete from public.albums_of_the_day
  where id in (select id from target);

-- Then trigger compute manually via curl.
```

```bash
curl -X POST 'https://<ref>.supabase.co/functions/v1/compute-album-of-the-day' \
  -H 'Authorization: Bearer <CRON_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_UUID"}'
```

### 6.2. Inspect 10 recent picks

```sql
select
  aotd.created_at,
  aotd.date,
  aotd.is_fallback,
  aotd.fallback_reason,
  a.primary_artist_name,
  a.title,
  a.lastfm_listeners,
  aotd.selection_reason->>'candidate_tier' as tier,
  aotd.selection_reason->>'popularity_bucket' as bucket,
  aotd.selection_reason->>'primary_source_artist' as primary_source,
  aotd.selection_reason->'source_artist_count' as source_count
from public.albums_of_the_day aotd
join public.albums a on a.id = aotd.album_id
where aotd.user_id = 'USER_UUID'::uuid
order by aotd.created_at desc
limit 10;
```

### 6.3. Track A health check

```sql
select * from public.v1_fallback_health;
-- Expect after Track A: fallback_pct < 10
```

### 6.4. Track B distribution check

```sql
select
  aotd.selection_reason->>'candidate_tier' as tier,
  aotd.selection_reason->>'popularity_bucket' as bucket,
  count(*) as picks
from public.albums_of_the_day aotd
where aotd.user_id = 'USER_UUID'::uuid
  and aotd.is_fallback = false
  and aotd.created_at > now() - interval '30 days'
group by 1, 2
order by 1, 2;
-- Expect: mainstream rarely appears, mix of adjacent + known_artist_new_album + occasional deep_discovery
```

---

## 7. Tests

### 7.1. Unit (Deno)

- `tier-classifier.test.ts` — known artist threshold (≥ 2), tier transitions across buckets, deep discovery requires similarity ≥ 0.6
- `popularity-bucket.test.ts` — boundary values (9_999, 10_000, 99_999, 100_000, 999_999, 1_000_000), null handling
- `recommendation-algorithm.test.ts` (existing, extend):
  - mainstream candidate with non-anchor tier gets penalized below niche adjacent
  - known artist new album beats unrelated mainstream adjacent
  - deep discovery beats niche only when similarity strong

### 7.2. Integration (manual, real Supabase)

- Run `prewarm-user-candidates` for test user → verify `recommendation_candidates` has eligible rows
- Run `compute-album-of-the-day` 10 times for that user (with delete/recompute each time) → check fallback rate
- Verify repeat guard still excludes album by Spotify ID, MB release group, and normalized artist+album

---

## 8. Deployment

Apply in this order:

```bash
# 1. Schema
PATH=/opt/homebrew/bin:$PATH npm run db:push
PATH=/opt/homebrew/bin:$PATH npm run db:types

# 2. New Edge Function
PATH=/opt/homebrew/bin:$PATH supabase functions deploy prewarm-user-candidates

# 3. Updated compute (cache-first)
PATH=/opt/homebrew/bin:$PATH supabase functions deploy compute-album-of-the-day

# 4. Updated sync (day-1 prewarm hook)
PATH=/opt/homebrew/bin:$PATH supabase functions deploy sync-spotify-library
```

After all deployments, in SQL editor:

```sql
-- Nightly cron for prewarm refresh.
select cron.schedule(
  'prewarm-user-candidates-nightly',
  '30 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/prewarm-user-candidates',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"limit_users": 25}'::jsonb
  );
  $$
);
```

Verify with `select * from cron.job`.

---

## 9. Rollout gates

This plan is intentionally **observation-gated**.

1. **Ship Track A only.**
2. Run manual prewarm for one test user.
3. Recompute 10 picks; inspect via §6.2 query.
4. If primary picks dominate (≥ 8 of 10 with `is_fallback=false`) **and look reasonable for the test library**, gate passes.
5. Wait 5–7 days of real-world cron runs. Check `v1_fallback_health` daily.
6. If `fallback_pct < 10%` sustained, Track A is done.
7. **Now decide:** are primary picks acceptable? If yes — Track B can be minimal (just mainstream penalty). If picks still look too mainstream → ship full Track B as specified.
8. Ship Track B. Observe 5–7 days. Tune thresholds if needed.

If Track A doesn't reach < 10% fallback after a week, do NOT ship Track B. Diagnose: maybe candidate cache isn't being warmed (check `prewarm-user-candidates` logs / `recommendation_candidates.fetched_at`).

---

## 10. Concrete decisions (no more "TBD" before implementation)

| Decision | Value | Where applied |
|---|---|---|
| Known-artist library appearance threshold | **≥ 2** | `tier-classifier.ts` |
| Popularity bucket boundaries (Last.fm listeners) | `< 10k / < 100k / < 1M / ≥ 1M` | `popularity-bucket.ts` |
| Prewarm trigger on initial sync | **fire-and-forget on `library_sync_status='completed'`** | `sync-spotify-library/index.ts` |
| Prewarm nightly refresh threshold | **`fetched_at` older than 7 days** | `prewarm-user-candidates/index.ts` |
| Unresolved candidate retry interval | **7 days** (`next_retry_at = now() + 7d` per attempt) | `prewarm-user-candidates/index.ts` |
| Nightly cron schedule | **`30 2 * * *` UTC** | pg_cron job |
| Track B mainstream penalty | **score × 0.4** when bucket=mainstream and tier ≠ safe_anchor | `recommendation-algorithm.ts` |
| Track B known-artist bonus | **score × 1.25** | same |
| Track B deep-discovery bonus | **score × 1.10** (only when tier already qualifies) | same |
| Min cache pool size before live recovery | **30 eligible aggregated candidates** | `compute-album-of-the-day/index.ts` |
| Min total pool size before fallback | **5** | same |
| Prewarm concurrency | **1 user at a time, 200ms throttle on Spotify search** | `prewarm-user-candidates/index.ts` |

---

## 11. Open questions (acceptable to defer)

- Should the bucket boundaries be **Last.fm listeners** or **playcount**? Listeners is more stable across genres (playcount skews to high-play habitual artists). Plan uses listeners; revisit if data shows it under-buckets niche-but-loyal communities.
- After Track B observation, do we want `release_balance` to also distinguish "rare-decade discovery"? Likely yes, but as a separate small follow-up, not in this plan.
- Should `safe_anchor` be reachable only via curated fallback, or also via primary path? Currently primary can pick `safe_anchor` if pool is thin. Acceptable for v1; revisit if it dominates.

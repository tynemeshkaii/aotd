# Discovery improvements v2.1 — implementation plan

Status: **planned** (not started). Author note: derived from `plans/deep-research-report.md` analysis, validated against live code at `ALGORITHM_VERSION = 2`. Research doc itself was written against a stale phase-4 v1 snapshot; only the three items below survived verification as real, high-value gaps. Everything else in the research (bandit/policy layer, session dynamics, "rewrite the weights", per-table artist/track signals) is deferred to a future v3 and intentionally **out of scope** here.

## Resolved decisions (locked)

These were the four open questions; resolved with rationale. The body below reflects them.

1. **Familiar origin marker → reuse the existing `source` column with `source='spotify'`.** No migration. Verified safe: every current write path uses the default `source='lastfm'` (compute live recovery and prewarm both pass nothing, and Spotify-related merging still writes under the caller's default). So `'spotify'` is currently unused → it becomes an unambiguous "familiar-catalog" tag. Add an explicit `candidate_origin` column later only if a second `'spotify'`-sourced path is ever introduced.
2. **Per-user popularity band → ship option B (pool-relative) first, no migration.** Reversible, decoupled, zero storage. Promote to option A (nightly stored per-user profile) only if shadow data shows pool-relative banding is too noisy.
3. **Mainstream-penalty rule → apply the ×0.4 penalty *only* to `tier === 'adjacent_artist'`.** Single clear condition. Auto-exempts `known_artist_new_album` (the familiar feature) and `safe_anchor` (already exempt today); `deep_discovery` can never be `mainstream` bucket so the change is a no-op for it. Replaces today's `bucket==='mainstream' && tier!=='safe_anchor'`.
4. **Familiar enrichment → leave `lastfm_listeners` null (→ `unknown` bucket); do NOT fetch Last.fm listeners during warm.** Cheaper warm (protects Spotify/Last.fm Dev-Mode quota), and `unknown` dodges both the mainstream penalty and the deep-discovery bonus — which is correct, because familiar candidates are meant to rank on the `known_artist_new_album` ×1.25 tier bonus plus `best_similarity_match = 1.0`, not on popularity. Revisit only if shadow shows familiar candidates under-ranking.

**Tuning note tied to #4:** familiar candidates get `similarity = 1.0` (literal artist match) *and* the ×1.25 tier bonus, so they will rank very high — which matches the research target mix (~45% familiar) and is desired. But if shadow shows familiar share dominating (>~55% of picks), dampen by assigning familiar `best_similarity_match ≈ 0.85` rather than touching weights. Decide from shadow data, not upfront.

## Goals (this plan only)

1. **Familiar-catalog generator** — recommend an *unknown album by an artist the user already knows*. Closes the single most valuable discovery gap. The scoring tier (`known_artist_new_album`, ×1.25) already exists but is never fed, because candidate generation only sources from *similar* artists.
2. **Per-user popularity band** — replace the global `popularityBucket` thresholds (10k/100k/1M listeners) with a band relative to the user's own library, so a niche listener gets pushed toward mid/long-tail instead of being judged against a global mainstream yardstick.
3. **Shadow mode** — a shadow table holding the alternative pick the new logic *would* have chosen, with full breakdown, served to nobody. Gives real before/after data instead of "feels better".

## Non-goals

- No bandit / policy layer.
- No session-dynamics signals.
- No new client UI (shadow is backend-only; familiar picks reuse the existing `selection_reason` surface).
- No changes to ratings-as-journal contract (ratings stay out of the ranker).
- No reintroduction of audio features (`includeTasteVector` stays `false`).

---

## Current-state facts the plan depends on

- Hot compute path is **cache-first**: `compute-album-of-the-day` calls `loadCachedCandidates()` first, runs bounded `generateCandidates()` live recovery only when the pool is `< MIN_CACHE_POOL_SIZE (30)`. `supabase/functions/compute-album-of-the-day/index.ts`.
- Per-user candidate warming already exists: `prewarm-user-candidates` (cron-secret, nightly `30 2 * * *`, fire-and-forget after initial/full sync). This is the correct home for the familiar-catalog generator — keep the hot path cheap.
- Candidate cache table: `recommendation_candidates`, one row per `(source, source_artist_key, candidate_artist_name, candidate_album_name)` (that's the upsert `onConflict`). Migration **`20260527030000_phase4_candidate_cache.sql`**. It already has a `popularity_bucket` column **and** a `source` column (`'lastfm' | 'spotify'`) — see below; the latter is a partial origin marker we can lean on instead of a new column.
- `loadCachedCandidates` filters rows by `source_artist_key IN (user's top-artist keys)`. **This is why familiar candidates load for free:** a familiar candidate's source artist *is* one of the user's top artists, so its cache rows already match the filter. No read-path change.
- `writeCandidatesToCache(admin, candidates, source)` stores `popularity_bucket` via the **global** `popularityBucket(listeners)` at write time. So the cached bucket is global — Item 2's relative bucketing must happen at **score time** (recompute from `lastfm_listeners`), not be read blindly from this column.
- **`recentArtistsToAvoid` (30-day) risk for familiar:** `rowPassesExclusions` drops any candidate whose artist appears in the last 30 days of picks. Familiar-catalog reuses known artists by design, so this filter can silently starve familiar picks for a user's most-recommended artists. The policy mix must tolerate this (familiar pool should span many known artists), or familiar candidates need a relaxed recent-artist rule.
- Exclusions remove only the user's **saved album IDs / release groups / normalized keys** — not all albums by an artist. So an *unsaved* album by a known artist passes the exclusion filter cleanly.
- Tier logic: `tier-classifier.ts` → `known_artist_new_album` when the candidate's primary artist has `libraryFreq >= 2`. Scoring bonus ×1.25 in `recommendation-algorithm.ts::applyTrackBScore`.
- **Gotcha:** `applyTrackBScore` applies `mainstream_penalty ×0.4` to any `mainstream` bucket candidate whose tier `!== 'safe_anchor'`. `known_artist_new_album` is not exempt → a mainstream known artist nets `0.4 × 1.25 = 0.5`. Familiar-catalog must be exempted or the feature is half-defeated for big artists.
- Spotify helpers live in `_shared/spotify-extended.ts` (`searchAlbum`, `fetchAlbumDetails`, `fetchRelatedArtistsOptional`, `fetchUserTopTracksOptional`, `spotifyFetch` internal). **No** `GET /artists/{id}/albums` helper yet — must add one. (Note `fetchRelatedArtistsOptional` already wraps the now-deprecated related-artists endpoint — don't build on it.)
- Spotify album resolution must go through `resolveSpotifyAlbumCached`; external calls go through the DB-backed limiter + circuit breaker + `external_api_request_log`. The familiar generator hits a *different* endpoint (`/artists/{id}/albums`) so it needs its own normalized endpoint name (e.g. `artist_albums`) in the limiter/log/breaker.

---

## Item 1 — Familiar-catalog generator

### Design

Source = the user's own top artists (already in `taste.topArtists`, each with `spotify_id`). For each, page Spotify `GET /artists/{id}/albums?include_groups=album&market=…`, drop releases already in library/history, drop ineligible release types via `isRecommendationReleaseLike`, and emit candidates whose `primary_artist == source_artist`. These flow into the **same** `recommendation_candidates` cache, so the existing `loadCachedCandidates` → `scoreCandidates` → `selectFromTop` path picks them up with zero hot-path changes.

Because `primary_artist_name` of a familiar candidate equals a library artist with `libraryFreq >= 2`, `classifyCandidate` tags it `known_artist_new_album` automatically. No scoring change needed beyond the mainstream-penalty exemption.

### Files

- **NEW** `supabase/functions/_shared/artist-catalog.ts`
  - `fetchArtistAlbums(token, artistId, market, opts)` → wraps `GET /artists/{id}/albums` with `include_groups=album,ep`, pagination (cap ~2 pages / 40 albums), via `spotifyFetch` + limiter/breaker under endpoint name `artist_albums`. Returns minimal album shape (id, name, artists, images, total_tracks, album_type, release_date).
  - `generateFamiliarCatalogCandidates(admin, token, taste, exclusions, recentArtistsToAvoid, opts)` → loops top-N source artists with `spotify_id`, fetches catalogs, filters exclusions + `isRecommendationReleaseLike` + `recentArtistsToAvoid`, dedupes via `album-dedupe.ts`, returns `AlbumCandidate[]` with `source_paths = [{ source_artist: self, similar_match: 1.0 }]` and `best_similarity_match = 1.0` (the artist is a literal match). **Per decision #4: leave `lastfm_listeners` undefined — do not fetch Last.fm during warm.** They will bucket as `unknown` and rank on the `known_artist_new_album` tier bonus + similarity, not popularity.
- **EDIT** `supabase/functions/prewarm-user-candidates/index.ts`
  - After the existing similar-artist warming, call `generateFamiliarCatalogCandidates` and `writeCandidatesToCache(..., 'spotify')` the result (reuse `source='spotify'` as the origin marker; the upsert `onConflict` already keys on `source`, so familiar and similar rows for the same album coexist). Gate behind a knob (`familiar_catalog_limit`, default small, e.g. 8 source artists × ≤3 albums). Respect the existing partial/circuit/skip semantics (`countEligibleCachedCandidates`, `pendingRetrySourceKeys`, `MIN_FRESH_ELIGIBLE_CANDIDATES`, `getExternalApiCircuitState`) — familiar warming failure must not discard similar-artist candidates already saved.
- **EDIT** `supabase/functions/_shared/recommendation-algorithm.ts`
  - In `applyTrackBScore`, change the mainstream-penalty condition to `bucket === 'mainstream' && tier === 'adjacent_artist'` (decision #3). Add a unit test asserting a mainstream `known_artist_new_album` is **not** penalized and a mainstream `adjacent_artist` still is.
- **EDIT** `supabase/functions/_shared/external-api-*.ts` (log/limiter/breaker)
  - Register `artist_albums` as a normalized endpoint (interval-limited like other Spotify endpoints; never log raw URLs).
- **EDIT** `supabase/functions/compute-album-of-the-day/index.ts` (optional, low priority)
  - The cache already carries familiar candidates after a nightly warm, so no hot-path change is required for steady state. Only add a tiny familiar live-recovery branch if day-1 (cold) users must get familiar picks immediately — otherwise leave the live recovery as-is to protect the 25s budget.

### Tests

- `artist-catalog` unit test: pagination cap, release-type filtering, exclusion of saved albums, dedupe.
- `applyTrackBScore` test: mainstream + `known_artist_new_album` → no penalty; mainstream + `adjacent_artist` → ×0.4 preserved.
- `release-eligibility` already covers EP/single edge cases — reuse.

### Risks / notes

- Spotify `/artists/{id}/albums` returns many duplicate/region editions → rely on `album-dedupe.ts` (exact id + MB release-group + normalized artist+album) hard.
- Don't over-warm: cap source artists and albums-per-artist; this runs nightly per user and Spotify Dev Mode quota is fragile.
- `recommendation_candidates` has no origin column. **Decision needed (see open questions):** add `candidate_source text` (`'similar' | 'familiar'`) for observability/composition metrics, or stay schema-clean and infer familiar-ness at read time (source_artist == candidate_artist). Recommended: add the column — cheap and makes Item 3 metrics trivial.

---

## Item 2 — Per-user popularity band

### Problem

`popularityBucket(listeners)` uses absolute global thresholds. A user whose whole library sits at 5k–50k listeners has *every* candidate judged "deep/niche" against a 1M mainstream ceiling, and the `mainstream_penalty` / `deep_discovery` logic never adapts to them.

### Design

Compute a per-user popularity reference (median + p25/p75 of listener counts across the user's library artists) and bucket candidates **relative** to it. Keep the global function as the fallback when the user profile is absent.

**Key constraint:** `user_library` rows do **not** store `lastfm_listeners`. Need a data source for per-artist popularity. Options (decide in open questions):

- **(A) Nightly precompute (recommended).** In `prewarm-user-candidates`, compute the user's listener distribution from artists already resolved (their similar-artist caches / `albums` rows / a bounded `artist.getInfo` pass) and store `{ p25, p50, p75 }` on a small table or a `profiles` jsonb column `popularity_profile`. Hot path just reads it. No extra hot-path API cost.
- **(B) Pool-relative (cheapest, weaker).** Skip per-user storage; compute the band from the candidate pool's own listener distribution at score time (already have `lastfm_listeners` per candidate in `scoreCandidates`). This shifts a niche user's pool naturally but doesn't anchor to *their* taste, only to the pool. Zero new storage/migration.

### Files

- **NEW (option A)** migration adding `profiles.popularity_profile jsonb` (or a `user_popularity_profile` table), `authenticated`-no-access / service-role only, consistent with existing grant hardening.
- **EDIT** `supabase/functions/_shared/popularity-bucket.ts`
  - Add `popularityBucketRelative(listeners, profile)` that maps against per-user p25/p50/p75; keep `popularityBucket` as the global fallback. `unknown` stays `unknown`.
- **EDIT** `supabase/functions/_shared/recommendation-algorithm.ts`
  - Thread an optional `popularityProfile` through `scoreCandidates` → use relative bucketing when present, global otherwise.
- **EDIT** `supabase/functions/_shared/taste-extraction.ts` or `prewarm-user-candidates`
  - Produce/store the profile (option A).
- **EDIT** `supabase/functions/compute-album-of-the-day/index.ts`
  - Load `popularity_profile` alongside taste; pass into `scoreCandidates`.

### Tests

- `popularity-bucket.test.ts`: same listener count buckets differently for a niche-profile user vs mainstream-profile user; missing profile → identical to global.
- `recommendation-algorithm.test.ts`: niche user's mid-tail candidate out-ranks a mainstream candidate it previously lost to.

### Risks / notes

- Start with **option B** if you want zero migration and fast iteration; promote to **option A** once shadow data shows it matters. B is reversible and decoupled.
- Guard against tiny libraries (few artists with listener data) → fall back to global thresholds when sample `< N`.

---

## Item 3 — Shadow mode

### Design

A shadow table stores, per (user, date), the pick the **new** logic would serve, with full breakdown, while the live pick is unchanged. Compare for ~2 weeks, then decide promotion with evidence.

Cheap because: after Items 1–2, the cached candidate pool already contains familiar candidates, and per-user banding is a pure re-rank. So shadow = **re-score the same pool** with the new band + tier-exemption and record the alternative winner. **Zero extra external API calls** in the hot path.

### Schema

- **NEW** migration `…_aotd_shadow_picks.sql`:
  ```
  create table public.aotd_shadow_picks (
    id uuid pk default gen_random_uuid(),
    user_id uuid not null references auth.users,
    date date not null,
    live_album_id uuid,            -- what was actually served
    shadow_album_id uuid,          -- what the new logic would serve
    shadow_selection_reason jsonb, -- full breakdown: tier, bucket(relative), band, score
    shadow_algorithm_version int,
    same_as_live boolean,          -- convenience flag
    created_at timestamptz default now(),
    unique (user_id, date)
  );
  alter table ... enable row level security; -- service-role only, no policies
  ```
  Follow the existing grant-hardening pattern (no `anon`/`authenticated` grants).

### Files

- **NEW** migration above.
- **EDIT** `supabase/functions/compute-album-of-the-day/index.ts`
  - After live selection (primary path only — skip on fallback), run a second `scoreCandidates(candidates, taste, rng, NEW_WEIGHTS_OR_BAND)` over the **same** `candidates` array, take `selectFromTop`, and insert into `aotd_shadow_picks` with `same_as_live = (shadow.id === live.id)`. Wrap in try/catch — shadow write must **never** fail or slow the real pick (best-effort, short timeout, no throw).
- **NEW (optional)** a tiny SQL view / `get_logs`-style query for analysis: divergence rate, shadow tier distribution, shadow vs live median popularity percentile.

### What to measure (2-week read)

- Divergence rate (`same_as_live = false` share).
- Composition of shadow picks: % `known_artist_new_album` vs `adjacent_artist` vs `deep_discovery` vs `safe_anchor`.
- Median candidate popularity percentile, live vs shadow.
- Eyeball a sample of divergent rows' `shadow_selection_reason`.

### Risks / notes

- Keep shadow strictly additive and best-effort; it is diagnostics, not a second product path.
- Shadow only meaningful on the **primary** path; don't shadow fallbacks (no real pool).

---

## Build sequence (dependency order)

1. **Item 1 generator + mainstream-penalty exemption** (feeds the pool; the exemption is required for the feature to matter). Ship to `prewarm-user-candidates`. Verify cache fills with familiar candidates for a test user.
2. **Item 2 — start with option B** (pool-relative, no migration). Wire band into `scoreCandidates`.
3. **Item 3 shadow** comparing current-live vs (Item1 pool + Item2 band) re-rank. Collect 2 weeks.
4. Read shadow data → decide: promote new band/tiers to live, and whether to upgrade Item 2 to option A (per-user stored profile).

Rationale: 1 must precede 3 (pool must contain familiar candidates for shadow to be meaningful). 2-option-B avoids a migration until shadow proves it's worth one.

## Manual / out-of-session steps (sandbox can't run these)

After any migration is added (Item 1 only if you choose the explicit origin column, Item 2 option A, Item 3 shadow table), in order:
1. `supabase db push`
2. `npm run db:types`
3. Deploy edge functions: `supabase functions deploy prewarm-user-candidates compute-album-of-the-day`
4. Manual QA in Spotify Development Mode with **low** `familiar_catalog_limit` first; inspect `recommendation_candidates` (familiar rows present) and `aotd_shadow_picks` before trusting output.

Order matters: types regenerate from the pushed schema; deploying functions before `db push` would run them against an old schema.

## Open questions

All four resolved — see **Resolved decisions (locked)** at the top of this file. Remaining tuning knobs (familiar similarity damping, option B→A upgrade) are intentionally deferred to *shadow-data-driven* decisions, not pre-code ones.

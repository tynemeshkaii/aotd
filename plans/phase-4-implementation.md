# Phase 4 implementation post-mortem

Date: 2026-05-25

## What was built

Recommendation algorithm pipeline: from user library analysis to daily album pick delivery.

### SQL migrations (5 files)

| Migration | Purpose |
|---|---|
| `20260526000000_phase4_user_library_artist_ids.sql` | Adds `primary_artist_spotify_id` and `artist_ids` jsonb to `user_library` for direct artist lookups |
| `20260526010000_phase4_streaming_product.sql` | Adds `spotify_product` to `streaming_connections`, rebuilds `streaming_connections_safe` view |
| `20260526020000_phase4_recommendation_schema.sql` | Creates `albums`, `artist_similarity_cache`, `audio_features_cache`, `musicbrainz_release_group_cache`, `albums_of_the_day`, `recommendation_history` |
| `20260526030000_phase4_recommendation_rpcs.sql` | `find_users_due_for_compute`, `ensure_recommendation_atomic`, `get_current_pick`, `resolve_user_compute_context` |
| `20260526040000_phase4_recommendation_fixes.sql` | Makes `ensure_recommendation_atomic` race-safe via `ON CONFLICT DO NOTHING`; hardens client status transitions |

### Shared helpers (10 files in `supabase/functions/_shared/`)

| File | Role |
|---|---|
| `lastfm.ts` | Rate-limited Last.fm client (200ms) with per-request timeout. `fetchSimilarArtists`, `fetchTopAlbumsForArtist`, `fetchAlbumInfo`, `fetchGloballyTopAlbums` |
| `musicbrainz.ts` | Rate-limited MusicBrainz client (1100ms) with DB cache. `getReleaseGroupCached`, `isAlbumLike` for compilation/live filtering |
| `spotify-extended.ts` | Extended Spotify client with 429 retry and per-request timeout. `searchAlbum`, `fetchAlbumDetails`, optional endpoints (`fetchRelatedArtistsOptional`, `fetchAudioFeaturesBatchOptional`, `fetchUserTopTracksOptional`), `getServiceSpotifyToken`. Spotify Search API errors throw; normal "no match" returns `null` |
| `album-dedupe.ts` | Shared normalized `artist + album` key helper for repeat/library exclusion across primary and fallback paths |
| `release-eligibility.ts` | Shared release guard used by primary candidate generation, prewarm, and curated fallback. Rejects true singles/compilations while allowing album/EP/mixtape-like releases |
| `external-cache.ts` | Cache-first wrappers using `artist_similarity_cache` and `audio_features_cache`. Flexible key format: `spotify:<id>` or `lastfm:<normalized_name>` |
| `rng.ts` | Mulberry32 seeded RNG for deterministic tests |
| `taste-extraction.ts` | Extracts `TasteSignal` from user library: top artists by frequency, decade fractions, optional taste vector from audio features |
| `candidate-generation.ts` | Last.fm-driven candidate pool. For each source artist: Last.fm getSimilar -> top albums -> Spotify search -> quality filter (>= 6 tracks or >= 20min) -> MusicBrainz dedup. Includes circuit breakers for consecutive Last.fm and Spotify Search API failures; Spotify "no match" skips only that candidate |
| `recommendation-algorithm.ts` | Pure scoring function. Weights: 0.45 similarity + 0.20 source_freq + 0.20 popularity_log_percentile + 0.05 release_balance + 0.10 temperature. `selectFromTop` does weighted random from top-20 |
| `curated-fallback.ts` | Picks from prewarm seeds excluding user's library, history, release groups, normalized album keys, and recent artists |

### Edge Functions (3 functions)

| Function | Trigger | Purpose |
|---|---|---|
| `compute-album-of-the-day` | Called by dispatch or day-1 trigger | Bounded pipeline: taste extraction -> limited candidate generation -> scoring -> album upsert -> atomic pick insert. Primary path has a short 25s budget and falls back to curated on failures, Last.fm/Spotify Search degradation, or compute budget exhaustion. Supports authenticated `force_fallback` smoke tests |
| `dispatch-daily-picks` | pg_cron hourly | Calls `find_users_due_for_compute` RPC, dispatches compute with concurrency=5. Has the same OPTIONS/method/auth guard surface as the other cron functions |
| `prewarm-album-cache` | pg_cron nightly | Fetches a bounded Last.fm globally-top batch, resolves via Spotify, upserts as prewarm seeds. Includes 10 bootstrap fallback seeds, supports `?limit=N`, and stops early with diagnostics when Spotify Search API is unavailable |

### Modified existing files

| File | Change |
|---|---|
| `supabase/config.toml` | `verify_jwt = false` for the 3 new functions |
| `lib/auth.ts` | Added `user-read-private` to `SPOTIFY_SCOPES` |
| `supabase/functions/_shared/spotify.ts` | Added `product` field to `SpotifyProfile` type |
| `supabase/functions/_shared/library-aggregation.ts` | Added `artist_ids` to `AggregatedAlbum` and both aggregation branches |
| `supabase/functions/upsert-streaming-connection/index.ts` | Writes `spotify_product` on upsert |
| `supabase/functions/sync-spotify-library/index.ts` | Maps `primary_artist_spotify_id` + `artist_ids` to rows; fires day-1 compute after sync completion |
| `app/(tabs)/index.tsx` | Shows `TodayCard` or `WaitingForPick` via `useTodayPick` hook |

### Client layer (new files)

| File | Purpose |
|---|---|
| `lib/recommendation.ts` | `SelectionReasonV1` interface, `formatSelectionReason()`, `TodayPick` type |
| `lib/hooks/useTodayPick.ts` | React Query + Realtime subscription for today's pick |
| `components/home/TodayCard.tsx` | Album card with cover, title, artist, year, selection reason |
| `components/home/WaitingForPick.tsx` | Placeholder while pick is computing |

### Tests

| File | Purpose |
|---|---|
| `tests/algorithm-fixtures.ts` | 3 taste profiles (mainstream, underground, tiny) + `makeCandidate` helper |
| `supabase/functions/_shared/recommendation-algorithm.test.ts` | 4 Deno tests: empty input, similarity beats popularity, decade balance, deterministic RNG |
| `supabase/functions/_shared/spotify-extended.test.ts` | Deno tests for Spotify Search semantics: 2xx no-match returns `null`, API failures throw |
| `tests/smoketest-apis.sh` | Manual Spotify + Last.fm endpoint availability check |
| `plans/phase-4-api-smoketest.md` | Template for recording smoketest results |

## Key design decisions

- **Last.fm as primary signal source.** Spotify `/related-artists` and `/audio-features` are optional enrichments that gracefully degrade to null. This avoids hard dependency on endpoints Spotify may restrict.
- **Injectable RNG.** All randomness flows through a `() => number` parameter, making scoring deterministic in tests via mulberry32 seed.
- **Flexible cache keys.** `artist_similarity_cache` uses `spotify:<id>` or `lastfm:<normalized_name>` keys, so artists without Spotify IDs still get cached.
- **Artist diversity guard.** No same `primary_artist_name` in last 30 days of picks, enforced at candidate generation.
- **Atomic pick insert.** `ensure_recommendation_atomic` RPC is race-safe via `INSERT ... ON CONFLICT DO NOTHING`, then returns the existing pick when another worker already created it.
- **Repeat guard.** Candidate generation excludes exact Spotify album IDs, MusicBrainz release groups, and normalized `artist + album` keys from both saved library and recommendation history, so alternate editions/remasters do not bypass the "no repeats" rule.
- **Day-1 instant pick.** `sync-spotify-library` fires compute after first sync completion via `EdgeRuntime.waitUntil`, so new users get their pick immediately.
- **Ratings are not algorithm input.** Algorithm reads only `user_library` + `recommendation_history`. Ratings are personal journal only, per master plan.

## Code review result

Initial audit found correctness issues in the phase-4 implementation: `ensure_recommendation_atomic` had a check-then-insert race, history/library dedup only excluded exact Spotify album IDs, and local lint/typecheck surfaced temporary typing gaps. These were fixed in the follow-up patch:

- `ensure_recommendation_atomic` now uses conflict-safe insertion and reports `already_exists` correctly from the compute function.
- Primary candidate generation and curated fallback now exclude prior albums by Spotify ID, MusicBrainz release group, and normalized `artist + album`.
- `compute-album-of-the-day` uses a bounded primary search budget and disables optional Spotify related-artists during manual/cron compute so external API degradation falls back instead of timing out the HTTP request. Candidate generation is intentionally capped (`maxSourceArtists=6`, `maxCandidates=24`, `maxMusicBrainzLookups=4`) and stops early after repeated Last.fm or Spotify Search failures.
- Client status updates on `albums_of_the_day` now allow only forward transitions and protect immutable recommendation fields.
- `npm run typecheck` and `npm run lint` pass locally.
- Deno runtime tests still require a local `deno` binary or Supabase/Deno CI runner; `deno` was not available in the Codex shell during the final pass.

## Session 2 — Production hardening (2026-05-25)

After the initial Phase 4 ship, `compute-album-of-the-day` was consistently falling into the curated fallback with `fallback_reason: "compute_timeout"`. A diagnostic session traced the problem and produced a hardening patch.

### Root cause

`spotifyFetch` in `_shared/spotify-extended.ts` did up to **3 retries on 429 with `setTimeout(Retry-After * 1000)` and no upper bound**. Spotify Development Mode returns `Retry-After: 2` (or longer) when its per-client_id quota is exhausted. The math: `4 × 3.5s fetch + 3 × 2s sleep ≈ 20s` on a single Spotify Search, exactly matching the candidate-stage timeout. The first similar artist in the loop would hang for ~20s and the outer `withTimeout` would throw `compute_timeout` — masking the real cause.

### Fixes

| File | Change |
|---|---|
| `supabase/functions/_shared/spotify-extended.ts` | `SPOTIFY_429_MAX_RETRIES = 1`, `SPOTIFY_429_MAX_RETRY_AFTER_MS = 1_000`. Worst case per API failure call now ~8s; with `maxConsecutiveSpotifySearchFailures=2` the primary path bails at ~16s with a correct `spotify_search_failed` reason instead of `compute_timeout`. `searchAlbum` throws on non-2xx Spotify API responses and returns `null` only for a normal 2xx "no album match" result |
| `supabase/functions/_shared/candidate-generation.ts` | Added per-stage `console.log` + structured `diag` events (`source_done`, `similar_pool_ready`, `sim_start`, `sim_done`, `gather_done`, `mb_done`). Added `skipAlbumInfoLookup`, `skipAlbumDetailsLookup`, `skipMusicBrainz` opts and `validateCandidateWithMb` helper for post-scoring MusicBrainz validation. Spotify Search no-match is not counted toward the API failure circuit breaker |
| `supabase/functions/compute-album-of-the-day/index.ts` | Primary path passes all three skip flags (saving up to ~12s of per-candidate `album.getInfo` calls), runs MusicBrainz validation only on the chosen candidate (up to 3 retries, then proceeds with best non-validated). Accepts `"diag": true` in request body and returns a `diag` array of timings. `classifyFallbackReason` now distinguishes `no_candidates`, `library_too_small`, `mb_timeout`, `spotify_search_failed`, `lastfm_unavailable`, `compute_timeout`, `unknown_error` correctly |
| `supabase/functions/prewarm-album-cache/index.ts` | Added OPTIONS handler, method guard (405 for non-POST), and explicit `!cronSecret` undefined check for parity with `compute-album-of-the-day`. Spotify Search no-match skips the seed; API failures count toward `spotify_search_unavailable` |
| `supabase/functions/dispatch-daily-picks/index.ts` | Added OPTIONS handler, method guard (405 for non-POST), and explicit `!cronSecret` undefined check for parity with `compute-album-of-the-day` and `prewarm-album-cache` |

### Acceptance test results (2026-05-25)

Ran against deployed functions with the user's real library (`library_size: 896`):

- ✅ `npm run lint` + `npm run typecheck` + `deno test _shared/recommendation-algorithm.test.ts` (4/4) — all clean.
- ✅ Idempotency on same `(user_id, date)`: first call `status: "created"`, second call `status: "already_exists"` with same `aotd_id`.
- ✅ Race condition: two parallel curls returned the same `aotd_id` (`INSERT ... ON CONFLICT DO NOTHING` confirmed working under concurrency).
- ✅ `force_fallback: true`: creates AOTD via curated path with `fallback_reason: "compute_timeout"`.
- ✅ Primary fail-fast: diag shows `primary_failed` at `t+2957ms` with `spotify_search_failed` (was 20331ms with `compute_timeout` before the 429 cap). 6× speedup on fallback path with correct error classification.
- ✅ `dispatch-daily-picks` returns `{ ok: true, dispatched: 0 }` when no users are due.
- ✅ Spotify Search no-match is no longer classified as API degradation in candidate generation or prewarm; only thrown API failures/timeouts increment the consecutive failure breaker.
- ✅ All three cron/external entrypoints (`compute-album-of-the-day`, `dispatch-daily-picks`, `prewarm-album-cache`) share the same OPTIONS, POST-only, and `!CRON_SECRET` auth guard behavior.
- ✅ Regression tests cover the Spotify Search distinction (`null` for no-match, throw for API failure).
- ⚠️ All recent picks are `is_fallback: true` because Spotify Dev Mode quota was burned by earlier testing. This is environmental, not a code defect. Primary path is fully wired and ready to flip to `is_fallback: false` once quota recovers or Extended Quota is granted.

### Operational guidance

- For ad-hoc debugging of compute latency, pass `"diag": true` in the request body instead of fishing logs out of the Supabase dashboard. `at_ms` for compute-stage events is request-relative; `at_ms` for candidate-generation events is candidate-internal-relative (candidate generation starts at the request-relative time of `exclusions_built`).
- When `fallback_reason: "spotify_search_failed"` is sustained, suspect Spotify Dev Mode quota, Spotify API errors, or Edge-region network failures. A normal 2xx "no search result" no longer produces this fallback reason.
- The diag mode adds ~1KB to the response payload. Safe to leave callable in production but cron does not request it by default.

## Session 3 — Final review fixes (2026-05-26)

Final Phase 4 review found two remaining polish issues and both are fixed:

- Spotify Search no-match is now distinct from Spotify API failure. `searchAlbum()` throws for non-2xx API responses/timeouts and returns `null` only when Spotify responds successfully but finds no matching album. Candidate generation and prewarm skip `null` matches without incrementing the API-failure circuit breaker.
- `dispatch-daily-picks` now has the same request surface as `compute-album-of-the-day` and `prewarm-album-cache`: `OPTIONS` handler, POST-only method guard, and explicit `!CRON_SECRET` auth check.

## Session 4 — Release eligibility hardening (2026-05-26)

Manual QA found a daily pick that was a one-track Spotify single. Root cause: the primary candidate path already rejected most singles, but prewarm/fallback could seed and select Spotify Search results that were singles.

Fixes:

- Added shared `isRecommendationReleaseLike()` guard.
- Primary candidate generation, prewarm, and curated fallback now use the same release eligibility rule.
- Spotify one-track singles and compilations are rejected; EP-like Spotify `single` rows are allowed only with >=3 tracks or >=10 minutes duration.
- MusicBrainz validation now allows `Album` and `EP`, permits `Mixtape/Street`, and still rejects `Single`, compilation, live, soundtrack, remix, and DJ-mix release groups.
- Added migration `20260527020000_phase4_release_eligibility_cleanup.sql` to set `is_prewarm_seed=false` on existing fallback seeds that are clearly singles/compilations.

Verification after this patch:

- `npm run lint`
- `npm run typecheck`
- `deno test --allow-env supabase/functions/_shared/recommendation-algorithm.test.ts supabase/functions/_shared/spotify-extended.test.ts` — 6/6 passing

## Session 5 — Recommendation quality hardening (2026-05-26)

Manual QA showed technically valid fallback picks that still felt disconnected from the imported Spotify library. The audit found three quality risks:

- `Various Artists` and similar pseudo-artists could enter `taste.topArtists` from compilation rows and waste source-artist slots.
- Primary compute explored a very narrow search space (`5` source artists, `4` similar artists, `1` album each) and fell back after only `2` consecutive Spotify Search failures.
- Curated fallback excluded repeats but otherwise behaved like a mostly global random prewarm pick.

Fixes:

- Added `_shared/taste-filters.ts` and filtered low-signal pseudo-artists during taste extraction.
- Expanded primary candidate generation to `8` source artists, `6` similar artists per source, `2` albums per similar artist, and `28` max candidates, while keeping the same 25s compute budget and non-critical lookup skips.
- Raised the primary Spotify Search breaker from `2` to `4` consecutive thrown API failures. Successful no-match searches still do not count as failures.
- Made `curated-fallback` taste-aware without adding external calls: it reads cached Last.fm similar-artist rows for the user's top library artists, scores eligible prewarm seeds by artist affinity, decade affinity, and popularity, then samples from the best pool.
- Added `source_artists` to `diag` output so future QA can see which library artists actually drove compute.

Verification after this patch:

- `npm run typecheck`
- `npm run lint`
- Deno tests were not run in the local Codex environment because `deno` is not installed there.

## Deployment checklist

Run in this order:

1. `supabase db push` — apply all 5 migrations
2. Set env vars on Supabase dashboard:
   - `CRON_SECRET` — shared secret for cron-triggered functions
   - `LASTFM_API_KEY` — Last.fm API key
   - `LASTFM_USER_AGENT` — e.g. `AlbumOfTheDay/1.0 (contact@example.com)`
   - `MUSICBRAINZ_USER_AGENT` — e.g. `AlbumOfTheDay/1.0 (contact@example.com)`
   - `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` — for client credentials flow (prewarm)
3. Deploy functions:
   ```
   supabase functions deploy compute-album-of-the-day
   supabase functions deploy dispatch-daily-picks
   supabase functions deploy prewarm-album-cache
   supabase functions deploy sync-spotify-library
   supabase functions deploy upsert-streaming-connection
   ```
4. Set up pg_cron jobs (via SQL editor or migration):
   ```sql
   select cron.schedule('dispatch-daily-picks', '0 * * * *',
     $$select net.http_post(
       url := '<SUPABASE_URL>/functions/v1/dispatch-daily-picks',
       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
     )$$);

   select cron.schedule('prewarm-album-cache', '0 3 * * *',
     $$select net.http_post(
       url := '<SUPABASE_URL>/functions/v1/prewarm-album-cache',
       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
     )$$);
   ```
5. `npm run db:types` — regenerate `types/database.ts` from the linked DB so `get_current_pick` is represented by generated Supabase types instead of the local typed RPC shim in `useTodayPick.ts`
6. Run API smoketest: `./tests/smoketest-apis.sh <SPOTIFY_TOKEN> <LASTFM_KEY>`, fill results into `plans/phase-4-api-smoketest.md`
7. Run prewarm manually once to seed the fallback pool:
   ```
   curl -X POST <SUPABASE_URL>/functions/v1/prewarm-album-cache?limit=30 \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```
   For additional seeding, rerun short batches with `?limit=20&artist_offset=6`, then `artist_offset=12`, etc. The function is intentionally bounded and all external API calls have short timeouts to avoid Supabase Edge Function request timeouts.
   If Spotify Search is unavailable from the Edge region, the response remains `200` with `stopped_reason: "spotify_search_unavailable"` so cron does not hang.

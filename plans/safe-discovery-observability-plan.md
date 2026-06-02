# Safe discovery observability — implementation plan

Status: **implemented**. Scope: additive diagnostics and tests only.

## Purpose

Add low-risk discovery observability so future recommendation changes can be judged with data before they affect live picks.

This plan intentionally avoids changing live album selection, user-facing copy, recommendation weights, candidate generation, Supabase auth/RLS contracts, Spotify API usage, or the ratings-as-journal product contract.

## Goals

1. Add a service-role analytics view for live-vs-shadow recommendation inspection.
2. Add an explicit candidate origin marker to `selection_reason` for newly computed picks.
3. Add tests that protect the current discovery safety contracts.
4. Document promotion criteria for moving shadowed discovery behavior into live ranking later.

## Non-goals

- No contextual bandit.
- No embeddings layer.
- No scene graph, genre taxonomy, label/country/language expansion, or new metadata collection.
- No ratings signal in recommendation scoring.
- No top-track/audio-feature signal in the live compute path.
- No change to `scoreCandidates` live arguments.
- No change to fallback selection.
- No user-facing UI changes.

## Current-state facts

- `compute-album-of-the-day` already writes `selection_reason` with `candidate_tier`, `popularity_bucket`, `source_artist_count`, and `track_b_multipliers`.
- `aotd_shadow_picks` already stores pool-relative popularity shadow picks with `shadow_algorithm_version = 3`.
- Familiar-catalog candidates are written to `recommendation_candidates` with `source = 'spotify'`.
- Similar-artist candidates are written to `recommendation_candidates` with the default `source = 'lastfm'`.
- Live ranking still calls `scoreCandidates(..., popularityProfile = undefined)`, so pool-relative banding remains diagnostic-only.
- Ratings must remain personal journal data and must not feed recommendation scoring.

## Item 1 — Discovery analytics view

### Design

Create a service-role-only SQL view that joins daily picks, albums, and shadow picks into one analysis surface.

The view should expose enough fields to answer:

- How often does shadow choose a different top album?
- Which candidate tiers are being served live?
- Which tiers are being chosen by shadow?
- What share of live picks are fallback?
- What share of picks are familiar-catalog vs similar-artist, once Item 2 is deployed?
- Are popularity buckets shifting in shadow compared with live?

### Migration

Add a migration named like:

`supabase/migrations/YYYYMMDDHHMMSS_discovery_observability_view.sql`

Create `public.v_discovery_pick_observability`.

Suggested columns:

- `user_id`
- `date`
- `aotd_id`
- `live_album_id`
- `live_spotify_id`
- `live_title`
- `live_primary_artist_name`
- `live_is_fallback`
- `live_fallback_reason`
- `live_candidate_tier`
- `live_popularity_bucket`
- `live_candidate_origin`
- `live_primary_source_artist`
- `live_source_artist_count`
- `shadow_album_id`
- `shadow_spotify_id`
- `shadow_title`
- `shadow_primary_artist_name`
- `shadow_same_as_live`
- `shadow_algorithm_version`
- `shadow_candidate_tier`
- `shadow_popularity_bucket`
- `shadow_candidate_origin`
- `shadow_primary_source_artist`
- `created_at`

The view should derive values from:

- `albums_of_the_day.selection_reason`
- `albums_of_the_day.album_id`
- `albums`
- `aotd_shadow_picks`
- shadow album join via `aotd_shadow_picks.shadow_album_id`

### Security

Follow existing observability table hardening:

- Revoke all privileges from `anon` and `authenticated`.
- Grant `select` only to `service_role`.
- Do not add RLS policies, because this is an operational view, not a client API.

### Notes

- Use JSONB extraction defensively.
- Missing keys should return `null`, not fail.
- Do not expose tokens, raw API URLs, profile emails, comments, or any Spotify OAuth material.

## Item 2 — Explicit candidate origin in `selection_reason`

### Design

Add a small helper in `recommendation-algorithm.ts` that classifies a scored candidate origin for diagnostics:

- `familiar_catalog` when the dominant source path points to the same Spotify artist as the candidate primary artist, or when normalized source artist name equals normalized candidate primary artist name.
- `similar_artist` when there is at least one source path and it is not familiar.
- `fallback` for fallback reasons.
- `unknown` only when the candidate is non-fallback but lacks usable source paths.

Write this as `candidate_origin` in `buildSelectionReason`.

### Files

- Edit `supabase/functions/_shared/recommendation-algorithm.ts`.
- Add focused tests in `supabase/functions/_shared/recommendation-algorithm.test.ts`.

### Compatibility

This changes only future `selection_reason` JSON. Existing rows keep missing `candidate_origin`, and the observability view must treat that as `null`.

### Important constraints

- Do not infer origin by reading from `recommendation_candidates` during compute.
- Do not add hot-path database reads.
- Do not add a new migration for this item.
- Do not change scoring, sorting, or sampling.

## Item 3 — Safety contract tests

### Tests to add or verify

1. `buildSelectionReason` sets `candidate_origin = 'familiar_catalog'` for a candidate whose primary artist is also its source artist.
2. `buildSelectionReason` sets `candidate_origin = 'similar_artist'` for a candidate reached through a different source artist.
3. Fallback `selection_reason` sets `candidate_origin = 'fallback'`.
4. `applyTrackBScore` keeps the current invariant: mainstream adjacent candidates get the mainstream penalty, but `known_artist_new_album` does not.
5. `scoreCandidates` with no popularity profile still uses global popularity buckets.
6. `scoreCandidates` with a pool-relative profile changes diagnostic bucket/rank only through the existing optional `popularityProfile` parameter.
7. Repository search or focused tests confirm ratings tables/RPCs are not imported or queried by recommendation scoring modules.

### Commands

Run the relevant Deno tests for Supabase shared functions. Prefer the repo's existing test command if present. If there is no aggregate command, run targeted Deno tests for:

- `supabase/functions/_shared/recommendation-algorithm.test.ts`
- `supabase/functions/_shared/popularity-bucket.test.ts`
- `supabase/functions/_shared/tier-classifier.test.ts`

## Item 4 — Promotion criteria document

### Design

Add a short section to either this file or `plans/discovery-improvements-v2.1.md` defining when shadow behavior can be promoted to live.

Initial criteria:

- At least 14 days of shadow rows from representative test users.
- Shadow write failure rate is low enough to trust the sample.
- Divergence rate is non-trivial but not chaotic.
- Shadow does not materially increase fallback involvement.
- Familiar-catalog share does not dominate the mix unless manual review confirms quality.
- Manual review of divergent picks finds no obvious release-type, repeat, or "too random" pattern.
- No regression in compute runtime, because shadow remains best-effort and bounded.

### Explicit non-criteria

- Do not promote only because one or two examples look better.
- Do not use personal ratings as automatic proof of algorithm quality.
- Do not promote if shadow rows are too sparse or mostly missing due to fallback.

## Suggested implementation order

1. Add `candidate_origin` helper and unit tests.
2. Add observability view migration.
3. Add or update promotion criteria docs.
4. Run targeted tests.
5. After migration is pushed and new computes have run, query the observability view before making any live-ranking changes.

## Manual follow-up after implementation

After code and migrations are committed, the user must apply the migration and regenerate types:

```sh
supabase db push
npm run db:types
```

Run `supabase db push` first because `types/database.ts` should reflect the live linked database schema. Regenerate types after the migration is applied, not before.

## Acceptance checklist

- New observability view is service-role only.
- Client roles cannot select from the view.
- `candidate_origin` appears in new non-fallback `selection_reason` rows.
- Existing rows without `candidate_origin` still work in the view.
- No live ranking arguments changed.
- No Spotify API calls added to compute.
- No ratings data used by recommendation code.
- Targeted tests pass.

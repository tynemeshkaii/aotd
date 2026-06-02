# Artist Country Chip — Implementation Plan

> **Status:** Implemented in code (migration/function deploy still required).
> **Goal:** Replace the low-value second chip on the album cover (rating/status) with the **artist's country**
> (e.g. `UK` / `US` / `FR` / `IT`). Chip 1 stays release year.
> **Scope:** This is a small **backend + client** mini-phase. It is **independent of** the editorial redesign
> (`plans/editorial-redesign.md`), which stays "backend: zero changes". The editorial work renders chip 2 as
> country-when-present, else year-only; this plan supplies the data.

---

## 1. Why this needs backend work

Artist country exists nowhere today:

- `public.albums` has `primary_artist_name`, `primary_artist_spotify_id`, `mb_release_group_id`,
  `release_year` — **no country**.
- `AlbumDiscovery` (client type) has no country field; the three read RPCs don't return it.
- **Spotify does not expose artist nationality.** Last.fm is unreliable for it.
- The only sound source is **MusicBrainz**: the artist entity's `country` (ISO 3166-1 alpha-2) or, when that
  is null, `area` / `begin-area` with `iso-3166-1-codes`.

Good news: the pipeline already calls MusicBrainz `release-group?query=` during post-selection validation
(`supabase/functions/_shared/musicbrainz.ts`). A release-group result includes `artist-credit[].artist.id`
(the artist **MBID**) when present, so **no extra search is needed** — only a single `/artist/{mbid}` lookup
for the country, on the chosen pick.

Implementation note: the existing `musicbrainz_release_group_cache` did not store artist MBIDs. The migration
adds `mb_artist_id`, `mb_artist_name`, and `artist_credit_resolved` so old cache rows can refresh once and new
rows carry the artist lookup key without adding a separate artist search.

---

## 2. Data source rules

- Primary: MusicBrainz `GET /artist/{mbid}?fmt=json` → `country` (alpha-2).
- Fallback when `country` is null: `area.iso-3166-1-codes?.[0]` (the area's country code), else
  `begin-area.iso-3166-1-codes?.[0]`. If still nothing → store `null`.
- **Display mapping:** store the raw ISO alpha-2 in the DB; map at display time. ISO uses `GB` for the United
  Kingdom — map `GB → UK` for the chip. Otherwise show the alpha-2 uppercased (`US`, `FR`, `IT`, `DE`, `JP`,
  `SE`, …). Keep a tiny override map for the few that differ from the desired label.
- **Coverage is partial and that is fine.** Solo artists usually have `country`; bands frequently have only
  `area` or nothing. Expect ~60–80%. The chip is **hidden when country is null** — never render `??`/`—`.
  Chip 1 (year) always remains.

---

## 3. Schema (migration)

Add two things:

1. **`public.mb_artist_cache`** — service-role-only per-artist country cache (so repeat artists never re-hit
   MB):
   - `mb_artist_id text primary key`
   - `name text`
   - `country text` (nullable, ISO alpha-2)
   - `resolved boolean not null default true` (distinguish "looked up, no country" from "never looked up")
   - `fetched_at timestamptz not null default now()`
   - RLS on; revoke all from `anon`/`authenticated`; no policies (service role only), mirroring the other
     cache tables.
2. **`public.albums.artist_country text`** (nullable) — denormalized so the existing read RPCs return it
   cheaply without a join. Index not required.

`npm run db:types` after applying.

---

## 4. Pipeline (Edge Function) changes

In `compute-album-of-the-day`, inside the **post-selection enrichment** that already does MB validation +
duration fetch for the chosen candidate only:

1. From the validated release-group response, read the primary `artist-credit[0].artist.id` (MBID). If
   absent, skip (leave `artist_country` null).
2. Resolve country via cache → MB:
   - Look up `mb_artist_cache[mbid]`. If present (even with `country = null`, `resolved = true`) and fresh,
     use it.
   - On miss/stale: `GET /artist/{mbid}?fmt=json`, extract country per §2, upsert into `mb_artist_cache`.
3. Persist the resolved value into `albums.artist_country` for the chosen album.

**External-API discipline (mandatory):** wrap the MB artist call in
`assertExternalApiCircuitAllows` + `reserveExternalApiSlot` + `recordExternalApiCall` under the normalized
endpoint name **`artist_lookup`** (service `musicbrainz`). Respect MB's ~1 req/s limit (reuse the existing
limiter). **Fail-open to null:** country is non-critical decoration — any failure/timeout/circuit-open must
leave `artist_country` null and **must never block, delay, or fail the pick**. Do not add retries beyond the
existing MB helper's policy. Add `artist_lookup` to the documented normalized-endpoint list.

This adds at most **one** MB call per served pick (cached per artist), in a path that already calls MB — no
new hot-path search, no candidate-loop fetches.

---

## 5. RPC changes

Add `album_artist_country text` to the return table of:

- `get_current_pick`
- `get_discoveries`
- `get_discovery_detail`

Per the project rule, **changing an existing function's return table requires `drop function … ` then
recreate** — `create or replace` cannot change the return type. Keep grants exactly as today
(`authenticated` only; never `anon`). No new filters/logic — just select `a.artist_country`.

---

## 6. Client changes

- Add `album_artist_country: string | null` to `AlbumDiscovery` in `lib/recommendation.ts`
  (after `npm run db:types`).
- Add a small `formatArtistCountry(code: string | null): string | null` helper (ISO alpha-2 → display;
  `GB → UK`; null → null).
- In the editorial cover chips (Home + album detail + Discoveries rows as desired): render chip 2 as the
  country marker **only when `formatArtistCountry` is non-null**; otherwise render just the year chip. Reuse
  the static `EditorialMarker` (ink fill, paper text) — no accent, no animation, consistent with the locked
  spec.
- Remove the status/rating value from the cover chip slot on Home (status still lives on Discoveries rows).

---

## 7. Backfill (existing albums)

Existing `albums` rows have `artist_country = null` until touched.

- **Lazy (default):** new/recomputed picks fill it going forward. Acceptable — old picks simply show year-only.
- **Optional batch backfill:** a one-off admin pass over `albums` with a non-null `mb_release_group_id`:
  resolve artist MBID → country via the same cache helper, throttled to MB's 1 req/s, idempotent. Nice-to-have,
  not required for ship. If added, run it off-peak and bounded.

---

## 8. Testing

- Unit: `formatArtistCountry` — `GB→UK`, `US→US`, `null→null`, unknown code passthrough uppercased.
- Unit: chip renders country when present; hides (year-only) when null; never shows placeholder.
- RPC: the three functions return `album_artist_country`; shape change applied via drop+recreate; grants
  unchanged; `anon` still cannot execute.
- Pipeline: artist-country resolution is best-effort — simulate MB failure / circuit-open → `artist_country`
  stays null, pick still succeeds, compute time unchanged within budget.
- Cache: second pick by the same artist does **not** issue a new MB `artist_lookup` call (cache hit).
- Observability: `artist_lookup` rows appear in `external_api_request_log` / `v1_external_api_health`; no raw
  query URLs, tokens, or PII logged.
- Regression: Home/Detail/Discoveries still render for old rows with null country.

---

## 9. Manual steps (sandbox can't run these)

In order:

1. Apply migration → `supabase db push` (run with sandbox disabled per repo rules).
2. `npm run db:types` to regenerate `types/database.ts` (then update `AlbumDiscovery`).
3. Deploy the function: `supabase functions deploy compute-album-of-the-day`.
4. (Optional) run the batch backfill once, throttled.

Order matters: migration before types before client field; function deploy after the migration so the new
`albums.artist_country` column exists when compute writes to it.

---

## 10. Risks / caveats

- **Coverage:** many bands have null country — chip hidden for them by design. Verify the hidden-state looks
  intentional (year-only), not broken.
- **`GB` vs `UK`:** MusicBrainz uses ISO `GB`; map to `UK` for display.
- **`area` ambiguity:** some artists have a city `area` without an `iso-3166-1` code → treat as null.
- **MB rate limit (1 req/s):** the added call is cached per artist and only on the served pick; keep it inside
  the existing limiter/circuit. Never let it slow or fail the pick (fail-open to null).
- **Return-shape migrations:** must `drop function` the three RPCs before recreating, or the migration fails.
- **Scope:** keep this out of the editorial redesign branch; it has its own migration + function deploy.

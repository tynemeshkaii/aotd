# Debug Audit Findings & Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness, observability, and dead-code issues found in a full-app debug audit on 2026-06-15.

**Architecture:** Targeted fixes only. No refactors. Each finding is an isolated task that preserves the product contracts in `AGENTS.md`.

**Tech Stack:** Expo/React Native, React Query, Supabase Postgres + Deno Edge Functions, NativeWind v4, editorial skin.

**Audit scope covered:** all `lib/` query hooks + invalidation keys, `lib/auth.ts`, `lib/library.ts`, `lib/profile.ts`, `lib/supabase.ts`, `lib/env.ts`, `AuthProvider`, `RouterGuard`/`app/_layout.tsx`, `app/(tabs)/index.tsx`, shared controllers, the editorial skin rating/share/states surfaces, and the edge functions `compute-album-of-the-day`, `sync-spotify-library`, `dispatch-daily-picks`, `_shared/day1-onboarding.ts`, `_shared/spotify.ts`, `refresh-spotify-token`, `upsert-streaming-connection`.

**Validation baseline at audit time:** `npm run typecheck` (tsc --noEmit) clean; `npm run lint` (biome) clean. So the issues below are logic / runtime / data-staleness / dead-code, not type or lint errors.

---

## Severity Summary

| # | Severity | Title | Surface |
|---|----------|-------|---------|
| 1 | Medium | Rating save never refreshes Profile stats (stale `rated_this_month` / `avg_score` / `loved_count` / `total_rated`) | `lib/hooks/useSaveRating.ts` |
| 2 | Low | Daily dispatcher counts HTTP 202 `deferred` as a successful dispatch | `supabase/functions/dispatch-daily-picks/index.ts` |
| 3 | Low | Spotify token refresh called with a possibly-null `refresh_token` → opaque `spotify_refresh_failed:400` | `_shared/spotify.ts`, `refresh-spotify-token/index.ts` |
| 4 | Low | `isRatingScore` type guard is mistyped (`value is RatingScore` but accepts `null`) | `lib/recommendation.ts` |
| 5 | Cleanup | Dead pre-editorial components in `components/album/` (8 files) still carry banned `active:opacity-*` styling and a stale `AGENTS.md` reference | `components/album/*`, `AGENTS.md` |
| 6 | Cleanup | Dead `useLibraryStats` hook (Profile reads stats from `get_profile_overview`) | `lib/hooks/useLibraryStats.ts` |

No High/Critical issues found. The hot paths (compute budget/fallback, day-1 deferral matrix, prewarm gating, token CAS, sync NOT-NULL upsert rule, request-body fail-closed parsing, query-key prefix invalidation) match the contracts in `AGENTS.md` and are correct.

---

## Task 1: Invalidate Profile overview after a rating save (Medium)

**Problem / evidence**
- `lib/hooks/useSaveRating.ts:55-63` `onSuccess` invalidates `['today-pick', userId]`, `DISCOVERIES_KEY`, `DISCOVERY_DETAIL_KEY`, and `UNRATED_PAST_PICK_COUNT_PREFIX`, but **not** `PROFILE_OVERVIEW_KEY(userId)`.
- `get_profile_overview.listening` returns `rated_this_month`, `loved_count`, `avg_score`, `total_rated` — all derived from `ratings`. After a rating, those numbers are stale.
- The only invalidators of `PROFILE_OVERVIEW_KEY` are `useLibrarySyncStatus` (library-sync Realtime channel) and `useTriggerLibrarySync` (manual sync). Neither fires on a rating. The Discoveries Realtime subscription listens to `ratings`, but it invalidates the discoveries list, **not** the profile overview.
- Result: the live `EditorialRatingEditor` (`components/skins/editorial/index.tsx:160`) saves a rating and the Profile screen keeps showing the old journal stats until app restart or a manual sync — worse when Realtime is unavailable (Expo Go firewall), which the codebase otherwise defends against everywhere via prefix invalidation.

**Files**
- Modify: `lib/hooks/useSaveRating.ts` (import + `onSuccess`)

**Steps**

- [ ] **Step 1: Add the import.** In `lib/hooks/useSaveRating.ts`, add alongside the other key imports:

```ts
import { PROFILE_OVERVIEW_KEY } from '@/lib/hooks/useProfileOverview';
```

- [ ] **Step 2: Invalidate the overview in `onSuccess`.** In the `onSuccess` block (currently `lib/hooks/useSaveRating.ts:55-63`), add the profile-overview invalidation next to the existing ones:

```ts
    onSuccess: async () => {
      if (!userId) return;
      qc.invalidateQueries({ queryKey: ['today-pick', userId] });
      qc.invalidateQueries({ queryKey: DISCOVERIES_KEY(userId) });
      qc.invalidateQueries({ queryKey: DISCOVERY_DETAIL_KEY(userId, aotdId) });
      qc.invalidateQueries({ queryKey: UNRATED_PAST_PICK_COUNT_PREFIX(userId) });
      qc.invalidateQueries({ queryKey: PROFILE_OVERVIEW_KEY(userId) });

      await showRatingMicrocopyOnce(userId);
    },
```

`PROFILE_OVERVIEW_KEY(userId)` is `['profile-overview', userId]` — a real 2-element key, so it matches the active query (no `undefined`-tail prefix trap).

- [ ] **Step 3: Typecheck.**

Run: `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 4: Manual verify (device/fixture).** Rate a pick, navigate to Profile, confirm `Rated this month` / Listening summary updates without a manual sync. Bonus: verify with Realtime disabled (Expo Go) that the stat still updates on navigation.

- [ ] **Step 5: Commit.**

```bash
git add lib/hooks/useSaveRating.ts
git commit -m "fix(ratings): refresh profile overview after saving a rating"
```

---

## Task 2: Dispatcher must not count a deferred pick as dispatched (Low)

**Problem / evidence**
- `supabase/functions/dispatch-daily-picks/index.ts:62` does `if (res.ok) { dispatched += 1 }`.
- `compute-album-of-the-day` returns **HTTP 202** with `{ ok: false, status: 'deferred', reason: 'day1_*' }` for a deferred first pick (`compute-album-of-the-day/index.ts:615-622`). 202 is in the 2xx range, so `res.ok === true`.
- `AGENTS.md` explicitly states: *"Treat this by response body, not by `Response.ok`, because 202 is still ok."* The day-1 wrapper (`runComputeStep`) already does. The dispatcher does **not** — it counts a no-op deferral as a real dispatch and never surfaces it.
- Impact: observability only. No `albums_of_the_day` row is created, so the user stays "due" and the next cron tick retries (self-healing). But `dispatched` overcounts and a stuck deferral is invisible. Low severity, no data corruption.

**Files**
- Modify: `supabase/functions/dispatch-daily-picks/index.ts` (parse body; branch on `deferred`; add `deferred_count` to response)

**Steps**

- [ ] **Step 1: Parse the body and branch on deferral.** Replace the per-user success branch (`dispatch-daily-picks/index.ts:62-74`) so a 202 `deferred` body is tracked separately and not counted as dispatched. Add a `deferred` counter near `let dispatched = 0;`:

```ts
  let dispatched = 0;
  let deferred = 0;
```

Then inside the `batch.map` handler, replace the `if (res.ok) { dispatched += 1 } else { ... }` block with:

```ts
          let parsed: Record<string, unknown> = {};
          try {
            parsed = (await res.json()) as Record<string, unknown>;
          } catch {
            parsed = {};
          }

          if (res.status === 202 && parsed.status === 'deferred') {
            deferred += 1;
            console.warn(
              `[dispatch] compute_deferred reason=${
                typeof parsed.reason === 'string' ? parsed.reason : '?'
              }`,
            );
          } else if (res.ok) {
            dispatched += 1;
          } else {
            const errorBody = JSON.stringify(parsed).slice(0, 500);
            failed.push({
              user_id: u.user_id,
              target_date: u.target_date,
              status: res.status,
              error: errorBody || res.statusText,
            });
            console.warn(`[dispatch] compute_failed status=${res.status} error=${errorBody}`);
          }
```

(Note: this replaces the previous `await res.text()` read; the body is now read once via `res.json()`. Keep the existing `catch (e)` network-error branch unchanged.)

- [ ] **Step 2: Surface `deferred` in the response.** Update the final `jsonResponse` payload (`dispatch-daily-picks/index.ts:88-97`) to include it:

```ts
  return jsonResponse(
    {
      ok: failed.length === 0,
      dispatched,
      deferred_count: deferred,
      failed_count: failed.length,
      failed,
      total_due: due.length,
    },
    { status: failed.length === 0 ? 200 : dispatched > 0 ? 207 : 500 },
  );
```

- [ ] **Step 3: Frozen check the entrypoint.**

Run: `deno check --frozen --config supabase/functions/dispatch-daily-picks/deno.json supabase/functions/dispatch-daily-picks/index.ts`
Expected: PASS. (If `dispatch-daily-picks` has no local `deno.lock`, drop `--frozen`.)

- [ ] **Step 4: Commit.**

```bash
git add supabase/functions/dispatch-daily-picks/index.ts
git commit -m "fix(dispatch): track day-1 deferrals separately instead of counting them as dispatched"
```

- [ ] **Step 5: Deploy reminder (manual).** `supabase functions deploy dispatch-daily-picks`.

---

## Task 3: Guard against a null Spotify refresh_token (Low)

**Problem / evidence**
- `_shared/spotify.ts:197` `getValidSpotifyToken` calls `refreshSpotifyAccessToken(data.refresh_token)` with no null check.
- `refresh-spotify-token/index.ts:94` calls `refreshSpotifyAccessToken(connection.refresh_token)` likewise.
- `refreshSpotifyAccessToken` (`_shared/spotify.ts:85-114`) puts the value straight into `URLSearchParams({ refresh_token })`. A `null` serializes to the literal string `"null"`, so Spotify returns 400 and the caller sees an opaque `spotify_refresh_failed:400` instead of a clear cause.
- `AGENTS.md` notes Spotify does not always return a refresh token and the upsert path preserves the existing DB token — but if that preservation ever leaves the column null, this surfaces as a confusing 400 cascade rather than a precise error.

**Files**
- Modify: `_shared/spotify.ts` (`refreshSpotifyAccessToken` — fail fast on null/empty)

**Steps**

- [ ] **Step 1: Reject a missing token at the source.** At the top of `refreshSpotifyAccessToken` (`_shared/spotify.ts:85`), before reading client credentials, add:

```ts
export async function refreshSpotifyAccessToken(refreshToken: string | null | undefined) {
  if (!refreshToken || refreshToken.trim().length === 0) {
    throw new Error('missing_refresh_token');
  }

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
```

Widening the parameter type to `string | null | undefined` lets the two existing call sites pass DB values without a cast while the guard converts a null into a clear `missing_refresh_token` (which `classifyFallbackReason` already buckets under `compute_timeout` → graceful fallback, and `refresh-spotify-token` returns as `500 unexpected` with a readable message).

- [ ] **Step 2: Typecheck the touched function.**

Run: `deno check --config supabase/functions/refresh-spotify-token/deno.json supabase/functions/refresh-spotify-token/index.ts`
Expected: PASS.

- [ ] **Step 3: Run the token-persist regression suite (unchanged behavior).**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/spotify-token-persist.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add supabase/functions/_shared/spotify.ts
git commit -m "fix(spotify): fail fast with missing_refresh_token instead of refreshing on null"
```

- [ ] **Step 5: Deploy reminder (manual).** Redeploy functions that bundle `_shared/spotify.ts`: `sync-spotify-library`, `compute-album-of-the-day`, `prewarm-user-candidates`, `refresh-spotify-token`.

---

## Task 4: Fix the `isRatingScore` type guard (Low)

**Problem / evidence**
- `lib/recommendation.ts:122-124` declares `function isRatingScore(value: unknown): value is RatingScore` but returns `true` for `null`. The predicate narrows a `null` to the non-nullable `RatingScore`, which is a type lie.
- It currently "works" only because the sole caller, `isAlbumDiscovery` (`lib/recommendation.ts:148`), wants the nullable check. Any future caller relying on the predicate would get a `RatingScore` typed value that can actually be `null`.

**Files**
- Modify: `lib/recommendation.ts` (rename + correct the predicate; update the call site)

**Steps**

- [ ] **Step 1: Rename and correct the predicate.** Replace `isRatingScore` (`lib/recommendation.ts:122-124`) with a correctly-typed nullable guard:

```ts
function isNullableRatingScore(value: unknown): value is RatingScore | null {
  return value === null || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}
```

- [ ] **Step 2: Update the call site.** In `isAlbumDiscovery` (`lib/recommendation.ts:148`) change `isRatingScore(value.rating_score)` to `isNullableRatingScore(value.rating_score)`.

- [ ] **Step 3: Typecheck.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add lib/recommendation.ts
git commit -m "fix(types): correct rating-score guard to allow null in its predicate"
```

---

## Task 5: Remove dead pre-editorial `components/album/` files (Cleanup)

**Problem / evidence**
- The editorial skin reimplements its album surfaces inside `components/skins/editorial/index.tsx`. The original pre-editorial components are now unreferenced. Verified by `grep` (only self-references / type-only imports):
  - `components/album/RatingEditor.tsx` — superseded by `EditorialRatingEditor` (`editorial/index.tsx:160`).
  - `components/album/AlbumActions.tsx` — contains banned `active:opacity-80/70` (`AlbumActions.tsx:33,50`).
  - `components/album/AlbumHero.tsx`
  - `components/album/CoverBackdrop.tsx`
  - `components/album/WhyThisAlbum.tsx`
  - `components/album/DiscoveryListItem.tsx` — contains banned `active:opacity-80` (`DiscoveryListItem.tsx:64`); **also cited as a live pattern in `AGENTS.md`** ("FlatList entrance animations should run once per item key per app session; see `DiscoveryListItem`") — that reference is now stale.
  - `components/album/AlbumDetailSkeleton.tsx` — superseded by `AlbumDetailProofSkeleton` (`editorial/index.tsx:406`).
  - `components/album/ShareCard.tsx` — superseded by `EditorialShareCard`.
- `components/album/StatusTabs.tsx` is imported **only** for its `DiscoveryFilter` type (3 sites: `editorial/index.tsx:18`, `DiscoveriesController.tsx:4`, `theme/skins/types.ts:6`). The `StatusTabs` component itself is unused.
- Still live and must NOT be deleted: `components/album/AlbumDetail.tsx` (used by `app/(tabs)/index.tsx` and `app/discoveries/[aotdId].tsx`) and `components/ui/CoverImage.tsx` (used by the editorial skin).
- Risk of leaving them: future agents copy banned `active:opacity-*` press patterns or the stale `DiscoveryListItem` doc pointer, reintroducing NativeWind v4 reliability bugs the editorial contract forbids.

**Files**
- Delete: the 8 dead files listed above.
- Move: `DiscoveryFilter` type out of `StatusTabs.tsx` into a non-component module, then delete `StatusTabs.tsx`.
- Modify: `AGENTS.md` (remove/replace the `DiscoveryListItem` pattern reference).

**Steps**

- [ ] **Step 1: Re-confirm zero live references right before deleting** (guard against drift since the audit):

```bash
for c in RatingEditor AlbumActions AlbumHero CoverBackdrop WhyThisAlbum DiscoveryListItem AlbumDetailSkeleton ShareCard; do
  echo "=== $c ==="; grep -rn "album/$c'" --include="*.ts" --include="*.tsx" . | grep -v "components/album/$c.tsx"
done
```

Expected: no output for any name. If any shows a live import, stop and reassess that file.

- [ ] **Step 2: Relocate the `DiscoveryFilter` type.** Add to `theme/skins/types.ts` (top of file, it already imports the type):

```ts
export type DiscoveryFilter = 'all' | 'pending' | 'rated';
```

Then update the two other importers to source it from there:
- `components/skins/shared/DiscoveriesController.tsx:4` → `import type { DiscoveryFilter } from '@/theme/skins/types';`
- `components/skins/editorial/index.tsx:18` → `import type { DiscoveryFilter } from '@/theme/skins/types';`

(Confirm the exact current `DiscoveryFilter` union in `components/album/StatusTabs.tsx` before copying — match it verbatim.)

- [ ] **Step 3: Delete the dead files.**

```bash
git rm components/album/RatingEditor.tsx \
       components/album/AlbumActions.tsx \
       components/album/AlbumHero.tsx \
       components/album/CoverBackdrop.tsx \
       components/album/WhyThisAlbum.tsx \
       components/album/DiscoveryListItem.tsx \
       components/album/AlbumDetailSkeleton.tsx \
       components/album/ShareCard.tsx \
       components/album/StatusTabs.tsx
```

- [ ] **Step 4: Update `AGENTS.md`.** In the motion/accessibility section, replace the line *"FlatList entrance animations should run once per item key per app session; see `DiscoveryListItem`."* with a pointer to the live editorial list item in `components/skins/editorial/index.tsx` (the entrance-once-per-key behavior now lives there). Keep the contract wording; only fix the file reference.

- [ ] **Step 5: Typecheck + lint (catches any missed importer).**

Run: `npm run typecheck && npm run lint`
Expected: PASS. A failure here means a live importer was missed — fix the import, don't restore the file.

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "chore(cleanup): remove dead pre-editorial album components; relocate DiscoveryFilter type"
```

---

## Task 6: Remove the dead `useLibraryStats` hook (Cleanup)

**Problem / evidence**
- `lib/hooks/useLibraryStats.ts` has zero importers (verified by grep). `ProfileController` reads `albumsTracked` / `lastSyncedAt` from `get_profile_overview` (`ProfileController.tsx:83-87`), not from this hook.
- `useTriggerLibrarySync` still invalidates `['library-stats', userId]` (`useTriggerLibrarySync.ts:19`) and `useLibrarySyncStatus` Realtime invalidates the same key (`useLibrarySyncStatus.ts:71`). With no consumer, those invalidations are harmless no-ops, but they imply a live query that does not exist.

**Files**
- Delete: `lib/hooks/useLibraryStats.ts`
- Optional tidy: drop the now-orphan `['library-stats', userId]` invalidations in `useTriggerLibrarySync.ts:19` and `useLibrarySyncStatus.ts:71`.

**Steps**

- [ ] **Step 1: Re-confirm no importers.**

```bash
grep -rn "useLibraryStats" --include="*.ts" --include="*.tsx" . | grep -v "lib/hooks/useLibraryStats.ts"
```

Expected: no output.

- [ ] **Step 2: Delete the hook.**

```bash
git rm lib/hooks/useLibraryStats.ts
```

- [ ] **Step 3 (optional): Remove the orphan invalidations.** In `useTriggerLibrarySync.ts` remove the `['library-stats', userId]` line, and in `useLibrarySyncStatus.ts` remove its `['library-stats', userId]` invalidation inside the Realtime handler. Leave the profile-overview and sync-status invalidations intact. Skip this step if you prefer to keep the keys reserved for a future stats query.

- [ ] **Step 4: Typecheck + lint.**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "chore(cleanup): remove unused useLibraryStats hook"
```

---

## Self-Review

- **Spec coverage:** All 6 findings have a task. No finding left unaddressed.
- **No placeholders:** every code step shows the actual code or exact command.
- **Type consistency:** Task 4 renames `isRatingScore` → `isNullableRatingScore` and updates its only caller in the same task. Task 5 moves `DiscoveryFilter` and updates all three importers in the same task. Task 1 imports `PROFILE_OVERVIEW_KEY` (existing export, signature unchanged).
- **Contract safety:** No change touches the day-1 deferral matrix, prewarm gating, token CAS write semantics, sync NOT-NULL upsert rule, request-body fail-closed parsing, or query-key prefix-invalidation rules documented in `AGENTS.md`.

## Validation matrix (run only what each task touches)

- App/client (Tasks 1, 4, 5, 6): `npm run typecheck` then `npm run lint`.
- Edge functions (Tasks 2, 3): `deno check` on the touched entrypoint; `deno test --allow-env --allow-net supabase/functions/_shared/spotify-token-persist.test.ts` for Task 3.
- Manual deploys after merge (Tasks 2, 3): redeploy `dispatch-daily-picks`, and the functions bundling `_shared/spotify.ts` (`sync-spotify-library`, `compute-album-of-the-day`, `prewarm-user-candidates`, `refresh-spotify-token`).

## Suggested order

1 (Medium, user-visible) → 2 → 3 → 4 → 5 → 6 (cleanups last). Each task is independent; none blocks another.

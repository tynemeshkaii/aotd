# Day-1 onboarding pick remediation plan

> **Status:** implementation in progress, phases 1–5 complete, phase 7 in flight.
> **Date:** 2026-06-04 (updated 2026-06-05 to reflect current working tree).
> **Scope:** first-login pick creation, late-night daily dispatch, fallback policy, and related observability.
> **Why this exists:** manual Expo Go QA found that a new user received a weak fallback first pick, then a much better algorithmic pick for the next calendar day minutes later.
> **Cross-references:** Phase 2 of `plans/comprehensive-debug-audit-remediation-plan.md` tracks the audit-originated follow-up work (generalized deferral, hardened prewarm, regression tests).

## 0. Confirmed incident

Test user facts from production data:

| Pick date | Created at UTC | Local time in `Asia/Bangkok` | Timezone at compute | Fallback | Reason | Album |
|---|---:|---:|---|---|---|---|
| `2026-06-04` | `2026-06-04 16:04:04+00` | `2026-06-04 23:04` | `Asia/Bangkok` | yes | `compute_timeout` | Bad Bunny - Un Verano Sin Ti |
| `2026-06-05` | `2026-06-04 16:05:13+00` | `2026-06-04 23:05` | `Asia/Bangkok` | no | n/a | Sexual Purity - Beautiful Scar of Society |

The user's active library count was `92`, so the bad first pick was not caused by an empty Spotify library.

Interpretation:

- The first pick was not a successful personalized recommendation. It was a curated fallback caused by `compute_timeout`.
- The second pick was a normal algorithmic pick, with `primary_source_artist = Boy Harsher` and candidate artist `Sexual Purity`.
- The "next day at 23:23" symptom is not a raw timezone conversion bug in this incident. The recorded timezone was `Asia/Bangkok`, and the next-day pick was created intentionally before local midnight.

## 1. Product goal

A first-time user should receive one high-confidence day-1 pick for their current local calendar day after Spotify login.

The app should not make the first user-visible album feel random, especially when enough Spotify library data exists. A fallback may still be acceptable for established users during an outage, but day-1 fallback should be delayed, retried, or clearly marked rather than silently becoming issue #1.

## 2. Current flow

Current first-login flow:

```text
Spotify OAuth
  -> upsert-streaming-connection
  -> syncDeviceTimeZone
  -> triggerLibrarySync("initial")
  -> sync-spotify-library imports saved albums/tracks
  -> marks library_sync_status completed
  -> fire-and-forget prewarm-user-candidates
  -> fire-and-forget compute-album-of-the-day
  -> Home reads get_current_pick
```

Current daily dispatch flow:

```text
dispatch-daily-picks
  -> find_users_due_for_compute(p_lead_minutes = 60, p_catchup_minutes = 1440)
  -> compute-album-of-the-day for the returned target_date
```

Current important behavior:

- `find_users_due_for_compute` precomputes tomorrow's pick when the user's local midnight is within the lead window.
- `compute-album-of-the-day` may fall back when primary compute times out.
- Home does not create a pick. It only reads today's row through `get_current_pick`.

## 3. Root causes

### 3.1 Day-1 compute can produce a weak fallback

`compute-album-of-the-day` has a 25s primary budget and falls back on timeout. In the confirmed incident, the first pick stored:

```json
{
  "is_fallback": true,
  "fallback_reason": "compute_timeout",
  "candidate_origin": "fallback"
}
```

For day-1 this is too aggressive. A timeout during cold candidate generation is common because caches may be empty, external APIs may be slow, and prewarm may still be running. Saving a random curated fallback as the user's first pick creates a bad first impression.

### 3.2 Prewarm and compute are launched back-to-back

In `sync-spotify-library`, `prewarm-user-candidates` and `compute-album-of-the-day` are both launched inside one background task, but compute does not wait for prewarm to complete.

That means day-1 compute may run before the candidate cache has enough high-quality rows. In a cold start, this increases the chance of live recovery, timeout, and fallback.

### 3.3 Late-night dispatcher can create tomorrow too early for brand-new users

The dispatcher is correct for established users: precompute tomorrow shortly before local midnight.

It is risky for new users because they may have just received today's first pick. If the user logs in around 23:00-23:59 local time, the dispatcher can create tomorrow's pick within minutes. This can make the app look like it skipped a day or handed out two picks too quickly.

### 3.4 Timezone race remains a separate risk

The confirmed incident used `Asia/Bangkok`, so this particular case was not caused by UTC fallback.

However, new profiles still default to `timezone = 'UTC'`, and the app writes the device timezone separately after auth. If compute runs before that write, a late-evening user in a positive UTC offset could still get a wrong target date. This should be hardened while fixing day-1.

## 4. Remediation strategy

Recommended approach: **make day-1 pick creation a stricter onboarding job, and make the dispatcher aware of first-day users.**

Do not solve this by only increasing timeouts. Longer budgets may reduce the symptom, but they do not fix the race between sync, prewarm, compute, and late-night dispatch.

## 5. Implementation phases

### Phase 1 - Add diagnostic SQL checks before code changes — **implemented**

Purpose: make the bug measurable and verify fixes later.

**Status:** shipped in `supabase/migrations/20260604120000_day1_dispatch_date_guard.sql`. Diagnostic views `v_day1_pick_diagnostics`, `v_rapid_double_pick`, `v_late_night_picks` are all service-role only.

Use this query for affected users:

```sql
select
  aotd.date,
  aotd.created_at,
  aotd.user_timezone_at_compute,
  aotd.is_fallback,
  aotd.fallback_reason,
  aotd.selection_reason,
  a.title,
  a.primary_artist_name
from public.albums_of_the_day aotd
join public.albums a on a.id = aotd.album_id
where aotd.user_id = '<USER_ID>'
order by aotd.date;
```

Day-1 fallback observability:

- Day-1 fallback rate.
- Day-1 `compute_timeout` count.
- Users with two picks created within 10 minutes of first login/sync.
- Picks created in the last hour before local midnight.
- Picks with `user_timezone_at_compute = 'UTC'` for users whose profile timezone later changed.

No client-facing changes in this phase.

### Phase 2 - Fix dispatcher date selection — **implemented**

Purpose: prevent tomorrow precompute from racing brand-new onboarding.

**Status:** shipped in `supabase/migrations/20260604120000_day1_dispatch_date_guard.sql`. The migration drops and recreates `find_users_due_for_compute` with three explicit rules and a new `p_first_pick_grace_minutes` parameter (default 60).

Modify `find_users_due_for_compute` so the date decision checks existing AOTD rows explicitly:

1. Resolve `local_now`, `today_date`, and `tomorrow_date`.
2. If no AOTD exists for `today_date`, return `today_date`.
3. Else if local midnight is within `p_lead_minutes`, return `tomorrow_date`.
4. Else return no row.

Add a new-user grace guard:

- If the user's first AOTD was created less than 60 minutes ago, do not dispatch tomorrow.
- Alternative if simpler: if `count(albums_of_the_day where user_id = p.id) = 1` and that row is today, skip tomorrow precompute until after local midnight.

Recommended first implementation:

```text
today missing wins over tomorrow precompute.
tomorrow precompute requires today exists and first pick is older than 60 minutes.
```

Touch points:

- `supabase/migrations/YYYYMMDDHHMMSS_day1_dispatch_date_guard.sql`
- Possibly tests or SQL smoke queries if the repo has a migration test pattern.

Acceptance:

- At 23:23 local time, a new user with no current-day pick is due for today, not tomorrow.
- At 23:23 local time, an established user with today's pick is due for tomorrow.
- A user whose first pick was just created today is not due for tomorrow for at least the grace window.

### Phase 3 - Make day-1 compute wait for prewarm — **implemented**

Purpose: reduce cold-start timeouts and avoid fallback issue #1.

**Status:** shipped in `supabase/functions/sync-spotify-library/index.ts:day1OnboardingCompute` (now delegated to `supabase/functions/_shared/day1-onboarding.ts`). The wrapper runs prewarm with `force: true`, checks the result, resolves the target date/timezone, then runs compute. The wrapper retries once after 15 s if compute returns an HTTP 202 `deferred`.

Replace the back-to-back fire-and-forget sequence in `sync-spotify-library`:

```text
waitUntil(prewarm)
waitUntil(compute)
```

with a single ordered day-1 background task:

```text
waitUntil(
  prewarm-user-candidates with { user_id, force: true, diag?: true }
    -> compute-album-of-the-day for explicit today date/timezone
)
```

The task should:

- Run only for `mode = initial`.
- Use the profile timezone after `syncDeviceTimeZone` has had a chance to persist.
- Resolve target date immediately before compute.
- Log prewarm result status and candidate count.
- Continue to compute if prewarm returns `warmed` or `partial` with usable candidates.
- Delay/retry if prewarm fails due to timeout or external API circuit.

Touch points:

- `supabase/functions/sync-spotify-library/index.ts`
- Optional shared helper for invoking internal functions with `CRON_SECRET`.

Acceptance:

- Initial sync completion triggers one ordered day-1 job.
- Compute starts after prewarm response, not concurrently.
- Existing bounded/manual sync behavior remains unchanged.

### Phase 4 - Add first-pick fallback policy — **partially implemented**

Purpose: prevent the first visible issue from being a timeout fallback when the user has enough library data.

**Status:** originally shipped in `supabase/functions/compute-album-of-the-day/index.ts:catch block` for `compute_timeout` only. Generalized deferral for **all non-personal fallback reasons** is the work tracked in **Phase 7 below**. The pure deferral helper now lives in `supabase/functions/_shared/day1-deferral.ts` and the reason matrix covers `compute_timeout`, `no_candidates`, `spotify_search_failed`, `spotify_audio_unavailable`, `lastfm_unavailable`, `mb_timeout`, `library_too_small` (when lib ≥ 10), and `unknown_error`.

Add day-1 fallback guard in `compute-album-of-the-day` or a wrapper around it.

Recommended policy:

- If this would be the user's first AOTD and fallback reason is `compute_timeout`, do not insert fallback immediately.
- Return a structured error such as:

```json
{
  "ok": false,
  "status": "deferred",
  "reason": "day1_compute_timeout"
}
```

- The onboarding job should retry once after a short delay, ideally after prewarm has completed.
- If the second attempt also fails, either:
  - keep `brewing` and surface an honest retry state, or
  - insert fallback only with explicit `selection_reason.message` that says it is a special non-personal pick.

Recommended product choice for V1:

```text
For issue #1, prefer brewing/retry over random fallback.
```

Allow fallback issue #1 only when:

- Active library count is very small, e.g. fewer than 10 aggregated albums.
- External APIs are unavailable for a long cooldown.
- The UI/copy makes the fallback nature clear.

Touch points:

- `supabase/functions/compute-album-of-the-day/index.ts`
- Possibly `components/onboarding` / Home state copy if deferred state is surfaced.

Acceptance:

- A first user with 92 library albums cannot receive `is_fallback = true, fallback_reason = compute_timeout` as issue #1.
- Existing users can still receive fallback during outages if needed.
- Fallbacks remain excluded from direct claims of personalization.

### Phase 5 - Harden timezone handoff — **implemented**

Purpose: remove the remaining UTC race for future late-night signups.

**Status:** shipped in `supabase/migrations/20260604180000_security_and_db_cleanup.sql` (adds `set_profile_timezone_if_valid`) and `supabase/functions/sync-spotify-library/index.ts:parsePayload → set_profile_timezone_if_valid call`. The function validates through `safe_profile_timezone` and skips the write when the input is not a valid IANA zone.

Options:

1. Pass device timezone to `sync-spotify-library` from the client and have the function update `profiles.timezone` before sync/compute.
2. Add a lightweight `set-profile-timezone` RPC/function called before `triggerLibrarySync("initial")`, then wait for it before syncing.
3. Pass explicit `target_date` and `user_timezone` into day-1 compute from the client-side known timezone.

Recommended approach:

- Keep `syncDeviceTimeZone` on the client.
- Change day-1 internal compute to resolve target date after profile timezone is updated.
- Add a defensive payload path that allows `sync-spotify-library` to receive `device_timezone` and update the profile server-side.

Touch points:

- `lib/auth.ts`
- `lib/library.ts`
- `supabase/functions/sync-spotify-library/index.ts`
- Maybe `types/database.ts` after migration/RPC if added.

Acceptance:

- New user profile timezone is correct before initial compute.
- `albums_of_the_day.user_timezone_at_compute` matches device timezone for day-1 picks.
- `UTC` is used only when the device timezone is unavailable or invalid.

### Phase 6 - UI guardrails and better user messaging — **partially implemented**

Purpose: avoid confusing users when background work is still legitimate.

**Status:** first-pick "Building your first pick" copy is shipped via the `isFirstPick = overview?.total_discovered === 0` branch in `app/(tabs)/index.tsx` and the matching `WaitingForPick` editor in `components/skins/editorial/index.tsx`. Outstanding UX items from this plan (deeper copy tuning if backend exposes additional deferred-status fields) remain in the backlog.

Current Home shows `Your pick is brewing` when no current-day row exists. That is okay but too vague for day-1.

Recommended improvements:

- If first sync is complete but day-1 compute is deferred/retrying, show a first-run state like:

```text
Building your first pick
We imported your Spotify library. Now we are narrowing the first album.
```

- If a fallback is shown, ensure "Why this album?" uses fallback copy and does not imply it was chosen from taste.
- In dev logs or QA surfaces, show `pick_date`, `is_fallback`, and `fallback_reason`.

Touch points:

- `components/skins/shared/InitialSyncingController.tsx`
- `app/(tabs)/index.tsx`
- `components/skins/editorial/index.tsx`
- `lib/recommendation.ts`

Acceptance:

- A delayed day-1 compute does not look like a broken empty state.
- A fallback does not masquerade as a personalized pick.
- Pull-to-refresh still works.

### Phase 7 - Extend first-pick deferral to all non-personal fallback reasons — **in flight**

Purpose: close the audit-confirmed gap where `no_candidates`, `spotify_search_failed`, `lastfm_unavailable`, `mb_timeout`, `unknown_error`, and `library_too_small` (with a large library) could still produce a silent curated fallback as issue #1.

Implementation:

- Extract a pure helper `shouldDeferFirstPick({ fallbackReason, existingPicks, aggregatedAlbumsCount, libraryCountThreshold })` in `supabase/functions/_shared/day1-deferral.ts`.
- Decision matrix in the helper. Every `day1_*` reason is namespaced so the day1 wrapper can match any of them with a `reason.startsWith('day1_')` check (replaces the old `reason === 'day1_compute_timeout'` literal).
- `library_too_small` defers only when `aggregated_albums_count >= 10` — with 10+ albums the issue is taste-extraction quality, not library size, so the user's library is large enough to deserve a real pick.
- `existingPicks > 0` and `aggregated_albums_count < 10` are explicit non-defer cases: established users keep getting fallbacks during outages; tiny-library users keep getting honest fallbacks.

Touch points:

- `supabase/functions/_shared/day1-deferral.ts` (new)
- `supabase/functions/compute-album-of-the-day/index.ts` (replaces inline `if (fallbackReason === 'compute_timeout')` block with the helper call)
- `supabase/functions/sync-spotify-library/index.ts` (now in `_shared/day1-onboarding.ts`, retry matcher generalizes to `day1_*` prefix)

Acceptance:

- A first-time user with `aggregated_albums_count >= 10` cannot receive a curated fallback as issue #1 for any non-personal reason.
- A first-time user with `aggregated_albums_count < 10` can still receive an honest `library_too_small` fallback.
- An established user can still receive a fallback during outages.

### Phase 8 - Harden prewarm failure state in `day1OnboardingCompute` — **in flight**

Purpose: ensure that an HTTP 5xx / network exception / malformed-JSON / no-status prewarm response does not silently fall through to compute.

Implementation:

- `runPrewarmStep` in `supabase/functions/_shared/day1-onboarding.ts` returns a discriminated `PrewarmOutcome` with two variants: `usable` (status `warmed` / `partial` / `skipped`) and `hard_failed` (with a `reason`).
- The orchestrator gates on the outcome kind:
  - `usable` → proceed to compute
  - `usable` with `status: 'skipped'` → still proceed (compute will produce its own honest library_too_small fallback if applicable)
  - `hard_failed` → log `prewarm_hard_failed` and return without calling compute
- Replaces the old implicit "if `prewarmResult.status` is undefined, fall through" behavior, which is what was causing the audit-flagged gap.

Touch points:

- `supabase/functions/_shared/day1-onboarding.ts` (new — `runPrewarmStep`, `runComputeStep`, `day1OnboardingCompute`)
- `supabase/functions/sync-spotify-library/index.ts` (now a thin adapter that resolves `Day1Deps` from runtime env and delegates to the shared module)

Acceptance:

- Prewarm HTTP 5xx / network error / malformed JSON / missing `status` skips compute and logs a clear warning.
- Prewarm `warmed` / `partial` / `skipped` proceeds to compute.

### Phase 9 - Regression tests for day-1 deferral policy and wrapper — **in flight**

Purpose: lock the day-1 correctness behavior with a test suite so the next refactor cannot silently regress it.

Implementation:

- `supabase/functions/_shared/day1-deferral.test.ts` — pure-function Deno tests covering every row of the deferral matrix plus boundary cases (count 9 vs 10, `existingPicks` 0 vs 1, custom threshold, null reason, unknown reason, reason namespacing). Currently 11 tests.
- `supabase/functions/sync-spotify-library/index.test.ts` — full integration harness with stubbed `fetchFn` (queue-driven `Response` specs covering `warmed` / `partial` / `skipped` / 500 / throws / malformed JSON / missing status), stubbed Supabase admin (only `rpc` is needed — uses a narrow structural `Day1Admin` type so the test file does not have to instantiate the full client), and injected clock / sleep. Currently 17 tests covering prewarm outcomes, compute outcomes, retry path, and timezone fallback.

Run with:

```sh
deno test --allow-env supabase/functions/_shared/day1-deferral.test.ts supabase/functions/sync-spotify-library/index.test.ts
```

Touch points:

- `supabase/functions/_shared/day1-deferral.test.ts` (new)
- `supabase/functions/sync-spotify-library/index.test.ts` (new)

Acceptance:

- All pure-helper tests and all wrapper integration tests pass locally.
- The `Day1Admin` structural type means the test file never instantiates the full Supabase client.

## 6. Data repair for the affected user

Options:

1. Leave both rows as historical QA data.
2. Delete the fallback `2026-06-04` row and keep `2026-06-05` as the first real issue.
3. Recompute `2026-06-04` manually with a forced target date, then replace the fallback row only if product/legal expectations allow operational repair.

Recommended QA-only repair:

- Leave data if this is a test account.
- If the friend will continue testing as a real user, delete or replace the fallback row so their archive starts with a real personalized pick.

Use caution:

- `albums_of_the_day` has related ratings/history semantics.
- If deleting, inspect `recommendation_history` and ratings before cleanup.

## 7. Validation plan

### SQL validation

Run date-window checks around local 23:23 for test profiles in:

- `Asia/Bangkok`
- `Europe/Samara`
- `America/New_York`
- `UTC`

Expected results:

- No current-day pick: due date is today.
- Current-day pick exists and first pick is older than grace window: due date can be tomorrow if within midnight lead window.
- Current-day pick just created: no tomorrow dispatch yet.

### Function validation

Run targeted function calls:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/sync-spotify-library" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"mode":"initial"}'
```

Then inspect:

- `library_sync_status.status`
- `library_sync_status.aggregated_albums_count`
- `albums_of_the_day.date`
- `albums_of_the_day.is_fallback`
- `albums_of_the_day.fallback_reason`
- `albums_of_the_day.user_timezone_at_compute`

Run compute with diagnostics:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/compute-album-of-the-day" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<USER_ID>","diag":true}'
```

Expected day-1 outcome for a 92-album library:

- `is_fallback = false`
- or deferred/retry status, not inserted timeout fallback.

### App validation

Manual Expo Go scenario:

1. Create fresh test user.
2. Set device timezone to `Asia/Bangkok` or test near local midnight.
3. Login with Spotify.
4. Wait for initial sync.
5. Confirm Home shows either a personalized current-day pick or an honest first-pick building state.
6. Confirm no next-day pick appears before the grace policy allows it.

## 8. Implementation order

1. Add dispatcher migration guard. ✅ shipped
2. Add day-1 ordered prewarm -> compute job. ✅ shipped
3. Add first-pick fallback deferral for `compute_timeout`. ✅ shipped (then generalized — see Phase 7)
4. Harden timezone handoff. ✅ shipped
5. Add UI copy/state only if backend can expose a useful deferred status. ✅ first-pick building state shipped, deeper copy pending
6. Run SQL/function validation with the affected test user. ⏳
7. Extend first-pick deferral to all non-personal fallback reasons. ⏳
8. Harden prewarm failure state in `day1OnboardingCompute`. ⏳
9. Add regression tests for day-1 deferral policy and wrapper. ⏳

Why this order:

- The dispatcher guard prevents the visible "next-day at 23:23" confusion first.
- Ordered prewarm reduces the actual timeout cause.
- Fallback deferral protects first impressions even when cold compute still fails.
- Timezone hardening closes a related but not confirmed race.

## 9. Manual follow-up after implementation

If migrations change:

```sh
supabase db push
npm run db:types
```

If Edge Functions change:

```sh
supabase functions deploy sync-spotify-library
supabase functions deploy compute-album-of-the-day
supabase functions deploy dispatch-daily-picks
```

Deploy only the functions touched by the final implementation.

## 10. Acceptance checklist

- A first-time user with a non-empty Spotify library does not receive a timeout fallback as issue #1. ✅ generalized to all non-personal reasons (Phase 7)
- A late-night new user does not receive tomorrow's pick before today's pick is stable. ✅ via Phase 2 dispatcher guard
- Established users can still get tomorrow precomputed before midnight. ✅
- Day-1 `user_timezone_at_compute` matches the user's device/profile timezone. ✅ via Phase 5 RPC
- `compute_timeout` is observable and retried/deferred for day-1. ✅ now all non-personal reasons
- The Home screen does not imply a fallback was personalized. ✅ first-pick building state
- Prewarm hard-failure does not silently fall through to compute. ⏳ Phase 8
- Deferral decision and wrapper behavior are covered by unit tests. ⏳ Phase 9
- Existing recommendation invariants remain intact: no ratings signal, no genre taxonomy, no skip mechanic, and no client access to service-role data. ✅


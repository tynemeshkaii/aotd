# Phase 1-5 audit plan

> Цель: перед переходом к design system, notifications, push, GDPR и beta-подготовке проверить, что фундамент фаз 1-5 реализован грамотно: без скрытых security holes, RLS/grants ошибок, гонок, rate-limit каскадов, неправильных продуктовых состояний и UX-регрессий core loop.

## 0. Source of truth

Использовать документы в таком порядке приоритета:

1. `CLAUDE.md` / `AGENTS.md` - текущий операционный контракт проекта.
2. `plans/phase-*-implementation.md` - фактические post-mortem по реализованным фазам.
3. `plans/phase-*.md` - фазовые планы и подробные acceptance criteria.
4. `plans/master-plan.md` - продуктовая и архитектурная база, но местами устаревшая относительно Phase 4/5 hardening.

Если документы конфликтуют, считать `CLAUDE.md` и implementation post-mortem более свежими, чем исходный master plan.

## 1. Audit output

Итогом аудита должен быть отдельный отчет с findings по severity:

| Severity | Meaning |
|---|---|
| P0 | Security/privacy/data leak, token exposure, destructive data corruption, production blocker |
| P1 | Correctness bug in core loop, broken auth/sync/recommendation/rating flow, serious race/idempotency issue |
| P2 | Reliability, rate-limit, edge-case, missing test, degraded UX state |
| P3 | Polish, copy, minor maintainability, low-risk cleanup |

Для каждого finding фиксировать:

- файл/миграция/функция;
- что нарушено;
- как воспроизвести или проверить;
- риск для пользователя/продукта;
- recommended fix;
- какой тест или ручная проверка закроет регрессию.

## 2. Global technical checks

Run first:

```bash
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npx expo install --check
PATH=/opt/homebrew/bin:$PATH npx expo config --type public
```

If local Deno is available:

```bash
deno test --allow-env supabase/functions/_shared/*.test.ts
```

Search for dangerous patterns:

```bash
rg "process\\.env" app components lib supabase/functions
rg "const .* = supabase\\.(rpc|from|auth|functions)" app components lib
rg "supabase\\.rpc" app components lib supabase/functions
rg "streaming_connections" app components lib supabase/migrations
rg "ratings" app components lib supabase/migrations supabase/functions
rg "skipped|listened|friends|stats|library\\.tsx|friends\\.tsx|stats\\.tsx" app components lib supabase
rg "#1db954|1db954" app components lib theme tailwind.config.js
```

Manual dependency checks:

- `npm install` must use `--legacy-peer-deps`.
- `react` and `react-native` must stay exact versions, no `^` or `~`.
- Expo SDK packages must match SDK 54 matrix.
- `expo-auth-session` should be `~7.0.11`.
- Reanimated 4 must have `react-native-worklets` installed.
- Check parent dirs for stray `node_modules` if version mismatch appears.

## 3. Phase 1 - App skeleton and architecture

Verify:

- Expo Router structure is coherent and there are only three v1 tabs: Home, Discoveries, Profile.
- No old user-facing `Library`, `Friends`, or `Stats` tabs were recreated.
- Deleted Library UI files remain deleted unless a future explicit plan restores them:
  - `components/library/LibraryListItem.tsx`
  - `components/library/LibrarySearchBar.tsx`
  - `lib/hooks/useLibrary.ts`
- Path alias `@/*` is used consistently.
- UI screens extend local primitives from `components/ui/` where appropriate.
- NativeWind color tokens are preferred over ad hoc hex values.
- `global.css` remains excluded from Biome because of Tailwind directives.
- `lib/sentry.ts` is still a safe stub until full Sentry integration in a later phase.

Review files:

- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/discoveries.tsx`
- `app/(tabs)/profile.tsx`
- `components/ui/*`
- `theme/colors.js`
- `tailwind.config.js`
- `lib/sentry.ts`

## 4. Phase 2 - Spotify Auth and profile

Verify OAuth/session contract:

- Supabase Auth in React Native uses SecureStore.
- `detectSessionInUrl: false`.
- `flowType: 'pkce'`.
- AppState starts/stops Supabase auto refresh.
- Callback flow uses `exchangeCodeForSession(code)` for PKCE.
- `setSession` is only an implicit-flow fallback.
- Explicit `auth/callback` route remains present.
- Callback parser accepts OAuth params from query strings and hash fragments.
- Logs print only param keys, never callback codes or tokens.

Verify Spotify connection handling:

- Provider access/refresh tokens are mirrored server-side only where needed.
- Service role keys never appear in app code or repo.
- Only anon key belongs in `.env.local`.
- Refresh tokens are preserved when Spotify does not return a new refresh token.
- Spotify `/me.product` is parsed and saved as `spotify_product`.
- `bootstrapSpotifySession(session)` dedupes connection upsert + timezone sync + initial sync per userId.
- `signOut()` clears bootstrap dedupe state.

Verify Edge Functions:

- `upsert-streaming-connection` has CORS handling.
- `refresh-spotify-token` has CORS handling.
- Both validate `Authorization` manually because `verify_jwt = false`.
- `refresh-spotify-token` tolerates an empty body for authenticated refresh.
- Invalid JSON returns `400 invalid_json_body`.

RLS/grants:

- Client cannot select from base `streaming_connections`.
- Client reads only `streaming_connections_safe`.
- `streaming_connections_safe` is security definer/default (`security_invoker = false`) and explicitly filters `auth.uid() = user_id`.

Review files:

- `lib/supabase.ts`
- `lib/auth.ts`
- `app/(auth)/sign-in.tsx`
- `app/auth/callback.tsx`
- `components/auth/AuthProvider.tsx`
- `supabase/functions/upsert-streaming-connection/index.ts`
- `supabase/functions/refresh-spotify-token/index.ts`
- Phase 2 migrations

## 5. Phase 3 - Spotify library import

Verify schema/security:

- `user_library`, `library_sync_status`, and `user_library_active` exist.
- Client writes to neither `user_library` nor `library_sync_status` directly except allowed status reads/subscriptions.
- All library writes go through service role in `sync-spotify-library`.
- `user_library_active` follows the same security-definer view pattern with explicit `auth.uid() = user_id`.
- Base-table grants/RLS do not expose another user's library.

Verify sync behavior:

- Saved albums and saved tracks are imported.
- Saved tracks are aggregated with the intended threshold.
- `sync-spotify-library` supports `initial`, `bounded`, and `full_reconcile`.
- OAuth first sync uses `initial`.
- Stale restore auto-sync uses `bounded`.
- Manual Profile sync uses `full_reconcile`.
- Bounded sync still updates `streaming_connections.last_synced_at`.
- Bounded sync does not trigger day-1 prewarm/compute.
- Initial/full sync may reconcile removals and trigger day-1 prewarm/compute.
- Sync progress patches use `.update().eq('user_id', userId)`, not partial `.upsert()` on NOT NULL tables.

Verify rate-limit safety:

- Auto-sync checks current `library_sync_status.status` before triggering.
- Auto-sync skips when status is `queued` or `syncing`.
- Failed sync has cooldown before retry.
- `autoSyncedRef` prevents repeated syncs in one app session.
- AuthProvider does not race initial OAuth connection creation.
- Initial OAuth sync is handled by sign-in/callback bootstrap.

Verify realtime:

- Hooks with Supabase realtime channels append `useId()` or otherwise unique instance IDs.
- Multiple mounts of `useLibrarySyncStatus` do not reuse identical channel names.
- `SyncBanner` renders only in Profile.

Review files:

- `supabase/functions/sync-spotify-library/index.ts`
- `supabase/functions/_shared/library-aggregation.ts`
- `lib/library.ts`
- `lib/hooks/useLibrarySyncStatus.ts`
- `lib/hooks/useTriggerLibrarySync.ts`
- `lib/hooks/useLibraryStats.ts`
- `components/library/SyncBanner.tsx`
- `components/auth/AuthProvider.tsx`
- `app/_layout.tsx`
- Phase 3 migrations

## 6. Phase 4 - Album of the day recommendation pipeline

Verify core product invariants:

- Algorithm reads only `user_library` and `recommendation_history`.
- Algorithm does not read `ratings`.
- Ratings are not used as scoring input.
- Algorithm does not rank by genre taxonomy.
- `selection_reason` references artist/library context, not genre ranking.
- Recommendations are real album/EP/mixtape-like releases, not one-track singles.

Verify schema/RPC security:

- `albums`, `albums_of_the_day`, `recommendation_history`, caches, candidates, and logs have correct RLS/grants.
- Service-only security-definer RPCs revoke execute from `public`, not only `anon`/`authenticated`.
- `ensure_recommendation_atomic` uses `INSERT ... ON CONFLICT (user_id, date) DO NOTHING`.
- Recommendation idempotency returns existing pick when another worker wins the race.
- Client updates to `albums_of_the_day` are status-only and forward-only.
- Recommendation fields are immutable from authenticated clients.
- `opened_at` is set/protected by DB trigger.

Verify repeat/dedupe guards:

- Exclude exact Spotify album IDs.
- Exclude MusicBrainz release group IDs.
- Exclude normalized `artist + album` keys.
- Exclusions use both `user_library` and `recommendation_history`.
- Recent artist guard prevents same primary artist too soon.

Verify release eligibility:

- Shared `isRecommendationReleaseLike()` is used by primary generation, prewarm, and curated fallback.
- Reject Spotify one-track singles.
- Reject Spotify `compilation` album_type rows.
- Allow EP-like Spotify `single` rows only when rule says they are release-like.
- MusicBrainz rejects `Single`, compilation, live, soundtrack, remix, and DJ-mix release groups.
- MusicBrainz allows Album, EP, and acceptable mixtape/street releases.

Verify compute architecture:

- Normal compute is cache-first through `recommendation_candidates`.
- Live generation is bounded recovery only.
- Primary path uses conservative `maxTextArtistLookups` and `spotifyResolutionTopK`.
- Primary path skips non-critical album info/details/MusicBrainz lookups.
- Chosen candidate gets post-selection Spotify detail enrichment for duration.
- Chosen candidate gets bounded post-scoring MusicBrainz validation.
- `diag: true` returns useful stage timings.
- Compute has explicit fallback reasons.
- Home does not mask RPC/network errors as WaitingForPick.

Verify external API safety:

- Spotify Search resolution goes through `resolveSpotifyAlbumCached`.
- Cache stores `resolved`, `no_match`, `bad_match`, `rate_limited`, and `spotify_unavailable`.
- Weak matches are not cached as `resolved`.
- Spotify 429 retry is capped to one retry and short Retry-After.
- Spotify Search no-match returns `null`; API failures throw.
- Spotify Search circuit breaker fails closed.
- Half-open allows only one probe.
- Last.fm `artist.getTopAlbums` uses global cache.
- MusicBrainz uses meaningful User-Agent and 1 req/s discipline.
- DB-backed limiter is used for high-risk endpoints.
- External API logs never store raw URLs with queries, auth headers, callback codes, or tokens.

Verify cron/dispatch:

- `compute-album-of-the-day`, `dispatch-daily-picks`, `prewarm-album-cache`, and `prewarm-user-candidates` share CORS, POST-only, and `!CRON_SECRET` guard behavior.
- `dispatch-daily-picks` calls `find_users_due_for_compute(60, 720)`.
- Partial failures return useful `failed_count` / `failed` data.
- pg_cron jobs read URL + bearer from Supabase Vault, not hardcoded strings.
- Vault has `project_url = https://<project-ref>.supabase.co` with no trailing slash.
- Vault has `cron_secret = CRON_SECRET`.
- `net.http_post(...)` responses are checked through `net._http_response`, not just queue ids.

Review files:

- `supabase/functions/compute-album-of-the-day/index.ts`
- `supabase/functions/dispatch-daily-picks/index.ts`
- `supabase/functions/prewarm-album-cache/index.ts`
- `supabase/functions/prewarm-user-candidates/index.ts`
- `supabase/functions/_shared/candidate-cache.ts`
- `supabase/functions/_shared/candidate-generation.ts`
- `supabase/functions/_shared/recommendation-algorithm.ts`
- `supabase/functions/_shared/curated-fallback.ts`
- `supabase/functions/_shared/album-dedupe.ts`
- `supabase/functions/_shared/release-eligibility.ts`
- `supabase/functions/_shared/spotify-album-resolution-cache.ts`
- `supabase/functions/_shared/external-api-*`
- Phase 4 migrations

## 7. Phase 5 - Album detail, ratings, Discoveries, share

Verify shared album UI:

- Home and historical detail both use shared `AlbumDetail`.
- Mandatory "Why this album" block is rendered by shared detail surface.
- Album hero, actions, rating editor, share, and open behavior do not drift between Home and Discoveries detail.
- Album duration and track count display when available.
- Home shows pending-history hint without guilt-loop pressure.

Verify Open in Spotify:

- Builds `spotify:album:{id}` and web fallback URL.
- iOS has `LSApplicationQueriesSchemes: ['spotify']`.
- `Linking.canOpenURL` failure falls back to web.
- Playback/opening is not blocked by DB status write.
- `pending -> opened` status update happens after opening attempt.
- Status update failures are logged, not user-blocking.
- Free/open Spotify explainer awaits dismissal before opening Spotify.
- SecureStore failures for one-time flags never block opening.

Verify ratings:

- UI has exactly five word labels:
  - `Loved it` -> 5
  - `Liked it` -> 4
  - `It was alright` -> 3
  - `Not for me` -> 2
  - `Bad` -> 1
- No numeric sliders, stars, or emoji-primary rating controls.
- Ratings are personal journal only.
- First rating microcopy explains ratings do not tune recommendations.
- `save_album_rating` validates ownership.
- `save_album_rating` upserts by explicit `ratings_user_id_album_id_key` constraint.
- Empty comments become `null`.
- `is_public` is forced false.
- Authenticated clients have SELECT only on `ratings`, no table-level INSERT/UPDATE.
- Client never writes directly to `ratings`; it calls RPC.
- Editing rating updates the same row, not duplicate rows.
- Direct `pending -> rated` works.

Verify Discoveries:

- `get_discoveries(p_user_id, p_limit default 365, p_offset default 0)` is bounded.
- Client can use defaults for now.
- Future infinite scroll should pass `p_limit` and `p_offset`.
- `All / Unrated / Rated` tabs filter correctly.
- `Unrated` includes both `pending` and `opened`.
- Historical detail loads by `aotdId`.
- Detail route shows explicit retry states on RPC/network errors.
- "Not found" is not used to hide query failures.

Verify Share:

- `ShareCard` captures a nonblank generated PNG.
- Cover art is prefetched before capture.
- iOS uses React Native `Share.share` so PNG + text/URL can be included.
- Other platforms use `expo-sharing.shareAsync`.
- Generated card includes cover, artist, album, and subtle app attribution.
- Share failures do not corrupt rating/open state.

Review files:

- `components/album/AlbumDetail.tsx`
- `components/album/AlbumActions.tsx`
- `components/album/AlbumHero.tsx`
- `components/album/WhyThisAlbum.tsx`
- `components/album/RatingEditor.tsx`
- `components/album/ShareCard.tsx`
- `components/album/DiscoveryListItem.tsx`
- `components/album/StatusTabs.tsx`
- `lib/recommendation.ts`
- `lib/hooks/useTodayPick.ts`
- `lib/hooks/useDiscoveries.ts`
- `lib/hooks/useDiscoveryDetail.ts`
- `lib/hooks/useOpenAlbum.ts`
- `lib/hooks/useSaveRating.ts`
- `lib/hooks/useSpotifyFreeExplainer.ts`
- `app/(tabs)/index.tsx`
- `app/(tabs)/discoveries.tsx`
- `app/discoveries/[aotdId].tsx`
- Phase 5 migrations

## 8. Manual E2E QA

Run on a real Spotify account after code/RLS review:

1. Fresh install / clean local session.
2. Login through Spotify OAuth.
3. Confirm profile row is created.
4. Confirm streaming connection row exists and safe view exposes only safe fields.
5. Confirm device timezone is synced to `profiles.timezone`.
6. Confirm initial library sync starts once.
7. Confirm sync status reaches `completed`.
8. Confirm large-library sync does not cascade into repeated auto-syncs.
9. Confirm day-1 prewarm/compute creates today's pick.
10. Confirm Home renders album detail, not waiting/error.
11. Confirm "Why this album" renders.
12. Open album in Spotify.
13. Confirm pending album becomes `opened`.
14. Save each rating label on test rows and verify stored integer.
15. Save rating directly from `pending` and verify status becomes `rated`.
16. Edit rating and verify no duplicate row.
17. Confirm first rating microcopy appears once per user.
18. Confirm Free/Open Spotify explainer appears once per user if account product is free/open.
19. Confirm Discoveries filters: All, Unrated, Rated.
20. Open historical detail by `aotdId`.
21. Share album card and verify native share sheet opens with nonblank image.
22. Temporarily simulate RPC/network failure and confirm retry states appear.

## 9. SQL / Supabase live checks

These require linked Supabase access and should be run carefully in Dashboard SQL or Supabase CLI.

Check grants/RLS for sensitive objects:

- `streaming_connections`
- `streaming_connections_safe`
- `user_library`
- `user_library_active`
- `library_sync_status`
- `albums_of_the_day`
- `recommendation_history`
- `ratings`
- `recommendation_candidates`
- `external_api_request_log`
- service-only RPCs

Check cron/vault:

- `cron.job`
- `cron.job_run_details`
- `net._http_response`
- `vault.decrypted_secrets`

Check API health:

- `v1_external_api_health`
- recent Spotify 429s
- recent MusicBrainz failures/timeouts
- recent Last.fm failures/timeouts

Check recommendation quality/debug fields:

- recent `albums_of_the_day.selection_reason`
- `is_fallback`
- `fallback_reason`
- `cache_candidates_ready`
- candidate tier/popularity metadata if present
- duplicate albums by Spotify ID, MB release group, normalized artist/title

## 10. Gate before Phase 6

Do not start broad Phase 6 design/polish work until:

- All P0 findings are fixed.
- All P1 findings are fixed.
- P2 findings are either fixed or explicitly accepted with a tracking issue.
- Typecheck and lint pass.
- Edge/Deno tests pass in a local or CI/Supabase-compatible environment.
- Manual E2E core loop passes on a real account.
- No evidence of Spotify sync/prewarm/compute cascades remains.
- No sensitive base table is exposed to authenticated clients.
- Ratings remain private journal data and are not algorithm input.
- Daily pick creation is timezone-correct and race-safe.


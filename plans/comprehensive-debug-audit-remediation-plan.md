# План исправлений по комплексному debug-аудиту

> Дата: 2026-06-04  
> Область аудита: Expo/React Native клиент, Supabase DB/RPC/RLS, Deno Edge Functions, recommendation pipeline, sync/auth flows, UI-контракты, состояние зависимостей.  
> Статус: найденные проблемы и поэтапный план исправления. Этот файл не вносит исправления в код.

## Базовая проверка

Во время аудита были запущены проверки:

- `rtk tsc` - прошло.
- `rtk test "npm run lint"` - прошло, Biome проверил 166 файлов.
- `rtk test "make check"` - прошло.
- `rtk test "deno test --allow-net supabase/functions/_shared/*.test.ts"` - прошло.
- `deno check` прошел для:
  - `compute-album-of-the-day`
  - `sync-spotify-library`
  - `dispatch-daily-picks`
  - `prewarm-user-candidates`
  - `refresh-spotify-token`
  - `upsert-streaming-connection`
  - `prewarm-album-cache`
- `rtk test "PATH=/opt/homebrew/bin:$PATH npx expo-doctor"` - прошло, 18/18 checks.
- `rtk test "npm audit --omit=dev --legacy-peer-deps"` - не прошло: 14 moderate advisories, текущий автоматический fix тянет breaking upgrade до Expo 56.

Аудит не проверял live-состояние Supabase cron, реально задеплоенные версии Edge Functions, production secrets и настоящие запросы к Spotify/Last.fm/MusicBrainz.

## Найденные проблемы

### P1 - Operational DB view доступен клиентам

`supabase/migrations/20260527030000_phase4_candidate_cache.sql` выдает `select` на `public.v1_fallback_health` роли `authenticated`.

Это противоречит текущему контракту проекта: operational telemetry surfaces должны быть доступны только `service_role`. View не используется приложением, и клиентским сессиям не нужен доступ к fallback-health telemetry.

Исправление:

- Добавить миграцию, которая делает `revoke all on public.v1_fallback_health from public, anon, authenticated`.
- Выдать `grant select` только `service_role`.
- После применения миграции регенерировать `types/database.ts`.

### P1 - Day-1 fallback guard покрывает только `compute_timeout`

В `supabase/functions/compute-album-of-the-day/index.ts` уже есть защита: первый pick с `compute_timeout` и достаточной библиотекой откладывается. Это полезно, но первый pick все еще может стать curated fallback при других non-personal причинах: `no_candidates`, `spotify_search_failed`, `lastfm_unavailable`, `unknown_error`.

В `supabase/functions/sync-spotify-library/index.ts` есть связанный риск: если prewarm падает до структурированного результата, `prewarmResult.status` остается `undefined`, и compute все равно запускается.

Исправление:

- Расширить first-pick deferral policy на все non-personal fallback reasons, когда `existingPicks = 0` и `aggregated_albums_count >= 10`.
- Сделать day-1 prewarm wrapper явным: HTTP failures/exceptions должны возвращать структурированный статус, после которого compute либо пропускается, либо откладывается.
- Добавить Deno/function-level тесты:
  - first pick + enough library + `compute_timeout` -> 202 deferred
  - first pick + enough library + `no_candidates` -> deferred/no insert
  - established user + outage -> fallback still allowed
  - small library -> fallback allowed with honest fallback reason

### P2 - Query invalidation слишком зависит от Realtime

Несколько клиентских flows корректны при рабочем Supabase Realtime, но могут оставить stale UI, если WebSocket недоступен.

Подтвержденные gaps:

- `lib/hooks/useTriggerLibrarySync.ts` вызывает `PROFILE_OVERVIEW_KEY()` без `userId`, что не обязано совпадать с `['profile-overview', userId]`.
- `ProfileController.handleRefresh()` обновляет profile identity, connection и overview, но не `library_sync_status`.
- `useSaveRating()` инвалидирует `UNRATED_PAST_PICK_COUNT_KEY(userId)` без exclude id, поэтому может не попасть в активный ключ `['unrated-past-pick-count', userId, excludeAotdId]`, если Realtime не сработал.

Исправление:

- Передавать `userId` в mutation hooks, которые инвалидируют user-scoped query keys.
- Вернуть `refetch` из `useLibrarySyncStatus()` и подключить его к Profile pull-to-refresh.
- Инвалидировать unrated-count по стабильному prefix `['unrated-past-pick-count', userId]` или через predicate.
- Добавить focused React Query/hook test на mutation invalidation без Realtime.

### P2 - `sync-spotify-library` принимает malformed JSON как initial sync

`sync-spotify-library` сейчас трактует invalid JSON как `{}` и запускает `mode = initial`. Для функции с `verify_jwt=false`, где auth проверяется вручную, malformed body должен fail closed.

Исправление:

- Возвращать `400 invalid_json_body` для malformed JSON.
- Отдельно решить и задокументировать, должен ли пустой body оставаться разрешенным.
- Добавить tests для empty body, invalid JSON, invalid mode и valid mode.

### P2 - Server-side timezone handoff пишет невалидированные строки

`sync-spotify-library` пишет `device_timezone` в `profiles.timezone`, если это непустая строка. SQL read paths используют `safe_profile_timezone`, поэтому основные runtime paths восстанавливаются, но в профиле все равно может храниться invalid timezone.

Исправление:

- Добавить RPC вроде `set_profile_timezone_if_valid` или валидировать через `safe_profile_timezone` до записи.
- При invalid timezone пропускать запись и логировать нормализованное предупреждение.
- Добавить SQL/function validation для invalid timezone input.

### P2 - Copy при initial sync failure ведет в недоступный Profile

`EditorialInitialSyncingView` пишет "Try again from Profile", когда первый sync failed. Но в first-time missing-library state `RouterGuard` оставляет пользователя на `InitialSyncingScreen`, и Profile еще недоступен.

Исправление:

- Заменить failed first-sync copy так, чтобы оно ссылалось на кнопку retry на этом же экране.
- Copy про Profile/manual sync использовать только для пользователей, которые уже завершали хотя бы один library sync.

### P2 - Day-1 plan document устарел

`plans/day-1-onboarding-pick-remediation-plan.md` говорит `Status: implementation plan, not yet implemented`, хотя в working tree уже есть day-1 dispatch migration, ordered prewarm/compute, timezone handoff и first-pick timeout deferral.

Исправление:

- Обновить статус документа: какие фазы implemented, partially implemented и still open.
- Связать этот audit plan с day-1 plan или объединить оставшиеся day-1 пункты в один canonical документ.

### P3 - UI text/layout contract drift

Negative `letterSpacing` найден в:

- `components/skins/editorial/index.tsx`
- `components/skins/editorial/EditorialAlbumActions.tsx`
- `app/+not-found.tsx`

Это расходится с текущей frontend-инструкцией и может ухудшать fitting при больших accessibility text sizes.

Исправление:

- Заменить negative letter spacing на `0`.
- Проверить sign-in masthead, album title, CTA и not-found screen на small iPhone width и large accessibility text.

### P3 - Share flow лучше разделить по платформам

`AlbumDetailController.share()` сначала проверяет `Sharing.isAvailableAsync()` для всех платформ, хотя iOS path дальше использует React Native `Share.share`.

На iOS devices это, вероятно, работает, но iOS path не должен зависеть от `expo-sharing` availability.

Исправление:

- Проверять `expo-sharing` только для non-iOS paths.
- На iOS после capture PNG напрямую вызывать `Share.share`.
- Smoke-test share card на iOS simulator/device.

### P3 - Dependency audit показывает moderate advisories

`npm audit --omit=dev --legacy-peer-deps` показывает 14 moderate vulnerabilities через Expo-related transitive dependencies (`postcss`, `uuid`). `npm audit fix --force` тянет Expo 56, а это breaking SDK upgrade и противоречит правилу сначала проверить Expo Go support на устройстве пользователя.

Исправление:

- Не запускать `npm audit fix --force`.
- Сначала искать Expo SDK 54-compatible patch path.
- Если исправление возможно только через Expo 56, вынести это в отдельный controlled SDK upgrade:
  - подтвердить, что Expo Go на устройстве поддерживает SDK 56
  - выполнить `npm install --legacy-peer-deps`
  - выполнить `npx expo-doctor`
  - выполнить `make check`
  - smoke-test OAuth, tabs, album detail, share и Supabase functions

## Фазы исправления

### Phase 1 - Security and DB access cleanup

1. Добавить миграцию для закрытия `v1_fallback_health`.
2. Добавить timezone validation RPC или DB-side guard.
3. После migration push регенерировать DB types.
4. Проверить grants через service-role query к `information_schema.role_table_grants` / `pg_proc.proacl`.

Acceptance:

- Operational views не доступны `anon` и `authenticated`.
- Client RPCs остаются authenticated-only.
- Service-only RPCs остаются service-role-only.

### Phase 2 - Day-1 recommendation correctness **[in progress]**

**Current state (2026-06-04):**

- Day-1 dispatch date guard and grace window: **shipped** in `supabase/migrations/20260604120000_day1_dispatch_date_guard.sql`.
- Ordered prewarm → compute in `sync-spotify-library`: **shipped** in `supabase/functions/sync-spotify-library/index.ts:day1OnboardingCompute`.
- First-pick `compute_timeout` deferral in `compute-album-of-the-day`: **shipped** in `supabase/functions/compute-album-of-the-day/index.ts:catch block`.
- Timezone handoff via `set_profile_timezone_if_valid`: **shipped** in `supabase/migrations/20260604180000_security_and_db_cleanup.sql`.
- Diagnostic views (`v_day1_pick_diagnostics`, `v_rapid_double_pick`, `v_late_night_picks`): **shipped** as service-role-only.
- First-pick building state on Home: **shipped** via `overview?.total_discovered === 0` in `app/(tabs)/index.tsx`.

**Remaining work (covered by `plans/day-1-onboarding-pick-remediation-plan.md` phases 7–9):**

1. Generalize first-pick deferral to all non-personal fallback reasons (extract a pure `shouldDeferFirstPick` helper, expand reason coverage, generalize the day1 wrapper retry matcher to match any `day1_*` reason).
2. Harden prewarm failure state in `day1OnboardingCompute` so HTTP 5xx / exception / malformed JSON / no status do not silently fall through to compute.
3. Add full integration test harness for the day1 wrapper (stubbed fetch, admin, clock) plus pure-function tests for the deferral matrix.
4. Update `plans/day-1-onboarding-pick-remediation-plan.md` to reflect current state and document the new phases.

Acceptance:

- First-time user с достаточной импортированной библиотекой не получает silent curated fallback как issue #1.
- Established users все еще могут получать fallback во время реальных outages.
- Late-night first-login users не получают rapid double picks.

### Phase 3 - Client refresh and offline-Realtime resilience **[shipped 2026-06-05]**

1. **shipped** — user-scoped React Query invalidation keys: `useTriggerLibrarySync` now reads `userId` from `useSession` and scopes `library-sync-status` / `library-stats` / `PROFILE_OVERVIEW_KEY(userId)` invalidation (was `PROFILE_OVERVIEW_KEY()` → `['profile-overview', undefined]`, which never partial-matched the active key).
2. **shipped** — `library_sync_status` refetch in Profile pull-to-refresh: `useLibrarySyncStatus` now returns `refetch`; `ProfileController.handleRefresh` calls it alongside profile/connection/overview (four queries total).
3. **shipped** — unrated-count invalidation after rating: added `UNRATED_PAST_PICK_COUNT_PREFIX(userId)` 2-element prefix; `useSaveRating` invalidates by prefix so it matches the Home query keyed `(userId, excludeAotdId)` (was `UNRATED_PAST_PICK_COUNT_KEY(userId)` = 3-element key with `undefined` at index 2, which never matched).
4. **partially done** — behavior verified by reasoning over React Query v5 partial-key matching + `rtk tsc` / `npm run lint`. A live "Realtime offline" hook test is still open: the app has no jest/vitest runner (only Deno for Edge Functions), so adding one is a separate dependency decision.

Acceptance:

- Manual sync обновляет Profile production notes и overview без ожидания Realtime. ✅ (key scoping fix)
- Saving a rating обновляет Home footer и Discoveries state даже без WebSocket invalidation. ✅ (prefix-invalidation fix)

### Phase 4 - API strictness **[shipped 2026-06-05]**

1. **shipped** — extracted side-effect-free parsers into `_shared/request-body.ts` (`parseOptionalJsonBody`) and `_shared/sync-request.ts` (`parseSyncBody`). Both fail closed: empty/whitespace body → `{}`; malformed JSON → not ok; valid-but-non-object JSON (number / string / boolean / array / `null`) → not ok (previously coerced to `{}` and could run a default path).
2. **shipped** — `sync-spotify-library` now parses via `parseSyncBody(await req.text())` and returns `400 invalid_json_body` for malformed/non-object body. The old `parsePayload` swallowed `SyntaxError` and returned `{}`, silently running `mode='initial'`; that fall-through is removed. Empty body stays allowed and defaults to `mode='initial'` (documented in `_shared/sync-request.ts`). Unknown `mode` still returns `400 invalid_sync_mode`.
3. **shipped** — `refresh-spotify-token` and `upsert-streaming-connection` now share `parseOptionalJsonBody`; their inline `parseJsonBody` is gone. They keep empty-body-allowed semantics and `400 invalid_json_body` on malformed input, and additionally reject non-object JSON.
4. **shipped** — auth-before-body ordering in `refresh-spotify-token`. Body parsing was moved to run only after the caller is established: a service request parses after the service-header check; a user request parses only after `getUser()` succeeds. Previously an unauthenticated user request with a malformed body returned `400 invalid_json_body` instead of `401 missing_auth`/`invalid_user`. `upsert-streaming-connection` already validated the JWT (`getUser()`) before reading the body, so it was left as-is.
5. **shipped** — per-function `deno.lock` for `refresh-spotify-token` and `upsert-streaming-connection` (matching `sync-spotify-library` / `compute-album-of-the-day` / `prewarm-user-candidates`). Both previously fell back to the repo-root `deno.lock`, which lacked the `@supabase/*` / `iceberg-js` / `tslib` graph, so `deno check --frozen` reported lockfile drift. With local locks, `deno check --frozen` is clean for all three entrypoints.
6. **shipped** — request-parsing unit tests: `_shared/request-body.test.ts` (5 cases) and `_shared/sync-request.test.ts` (6 cases: empty, valid modes, device_timezone passthrough, malformed, non-object, unknown mode). Day-1 suites (`day1-deferral.test.ts`, `sync-spotify-library/index.test.ts`) still pass (42 tests total across the run).

Acceptance:

- Invalid JSON не может случайно запустить initial sync. ✅
- Invalid sync mode остается `400 invalid_sync_mode`. ✅
- Auth behavior не меняется: unauthenticated requests fail with `401` before any body parsing; only post-auth body handling changed. ✅
- `deno check --frozen` clean for `sync-spotify-library`, `refresh-spotify-token`, `upsert-streaming-connection`. ✅

### Phase 5 - UI/accessibility polish **[partially shipped 2026-06-05]**

1. **shipped** — negative `letterSpacing` removed from 4 locations: `editorial/index.tsx` `display34` style (`-1` → `0`), sign-in masthead (`-1.4` → `0`), `EditorialAlbumActions.tsx` "Listen on Spotify" button (`-1.05` → `0`), `app/+not-found.tsx` title (`-0.8` → `0`). Positive letter-spacing values preserved as intentional editorial tracking.
2. **shipped** — first-sync failed copy fixed: `EditorialInitialSyncingView` now says "Tap below to retry" (retry button is on that screen; Profile is unreachable during first sync). `syncFailureCopy` and `SyncBanner.tsx` now say "Try syncing again" without referencing Profile (user is already there).
3. **shipped** — iOS share no longer gates on `Sharing.isAvailableAsync()`: iOS uses `Share.share` (always available); `expo-sharing` check runs only for non-iOS platforms.
4. **open** — visual/manual QA on iPhone SE-width, notched iPhone, larger Dynamic Type. Requires device/simulator testing by the user.

Acceptance:

- Нет text overlap или clipped mastheads в проверенных viewports. (pending QA)
- First-sync failure copy соответствует реально доступному действию. ✅
- Share card по-прежнему captures PNG и открывает native share sheet. ✅ (logic preserved, iOS path simplified)

### Phase 6 - Dependency hygiene **[shipped 2026-06-05]**

1. **shipped** — `postcss` XSS advisory (GHSA-qx2v-qp2m-jg93, moderate) resolved via `npm overrides`: `"postcss": ">=8.5.10"` in `package.json`. Installed version: 8.5.15. `@expo/metro-config@54` pins `~8.4.32` which blocks natural resolution to 8.5.x, but the override is safe: the fix is stringify-only `</style>` escaping, no behavioral change for build tooling. `tailwindcss` `^8.4.47` already accepts 8.5.x via caret.
2. **accepted** — `uuid` 7.x advisory (GHSA-w5hq-g745-h8pq, moderate, 13 paths via `expo` → `@expo/config-plugins` → `xcode` → `uuid@^7.0.3`). Not exploitable in this dependency chain: `xcode` calls only `uuid.v4()` without a `buf` argument; the advisory affects v3/v5/v6 when `buf` is provided. Fix requires `uuid >=11.1.1` (4 major versions, ESM-only since v10), and `xcode` pins `^7.0.3`. Override would break CJS `require('uuid')`. Will resolve naturally when Expo upgrades `xcode`.
3. **shipped** — validation passed: `make check` (Biome 174 files + `tsc --noEmit`), `npx expo-doctor` 18/18 checks, `npm audit --omit=dev` confirms postcss advisory gone (14 → 13 moderate, all remaining are the accepted uuid chain).
4. **shipped** — `react` 19.1.0 and `react-native` 0.81.5 exact-version constraints preserved. No Expo SDK 56 upgrade needed.

Acceptance:

- Dependency advisories resolved или явно accepted with rationale. ✅ (postcss fixed, uuid accepted — not exploitable)
- Exact-version constraints для React и React Native сохранены. ✅

## Ручная валидация, которую еще нужно сделать

- Проверить live Supabase cron command: он должен вызывать `dispatch-daily-picks` с ожидаемым `CRON_SECRET`.
- После DB changes: выполнить `supabase db push`, затем `npm run db:types`.
- После Edge Function changes: деплоить только touched functions, вероятно:
  - `sync-spotify-library`
  - `compute-album-of-the-day`
  - `refresh-spotify-token` только если shared parsing changes его затронут
- Провести fresh-user QA scenario около позднего локального времени хотя бы в одной timezone с положительным UTC offset.


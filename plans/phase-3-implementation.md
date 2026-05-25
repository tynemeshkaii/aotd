# Фаза 3 — Реализация: что по факту построено

> Этот документ описывает **как оно реализовано** — в отличие от `phase-3-library-import.md`, который является планом.
> Статус: ✅ завершено, e2e верифицировано (2026-05-25). Hardening pass: server-side sync dedupe, stale-sync retry, `SYNC_TRACK_LIMIT`, bounded 429 backoff (2026-05-25).

---

## 1. Карта файлов

### Новые файлы

| Файл | Назначение |
|------|-----------|
| `supabase/migrations/20260524000000_user_library_and_sync_status.sql` | Таблицы `user_library`, `library_sync_status`, вьюха `user_library_active` |
| `supabase/migrations/20260525000000_harden_library_sync_start.sql` | RPC `try_start_library_sync()` для атомарного запуска sync и server-side дедупликации |
| `supabase/functions/_shared/library-aggregation.ts` | Чистая функция агрегации Saved Albums + Saved Tracks |
| `supabase/functions/sync-spotify-library/index.ts` | Edge Function: фоновый импорт библиотеки |
| `supabase/functions/sync-spotify-library/deno.json` | Import map для Edge Function |
| `lib/library.ts` | `triggerLibrarySync()` — вызов Edge Function с клиента |
| `lib/hooks/useLibrarySyncStatus.ts` | Realtime-подписка + polling fallback на статус синка |
| `lib/hooks/useTriggerLibrarySync.ts` | `useMutation` обёртка для ручного запуска синка |
| `lib/hooks/useLibraryStats.ts` | `albumsTracked` + `lastSyncedAt` для Profile |
| `components/library/SyncBanner.tsx` | Прогресс-банер (рендерится только в Profile) |
| `components/ui/ProgressBar.tsx` | Переиспользуемый прогресс-бар |
| `components/onboarding/InitialSyncingScreen.tsx` | Full-screen заглушка при первом синке |

### Изменённые файлы

| Файл | Что изменилось |
|------|---------------|
| `supabase/functions/_shared/spotify.ts` | Добавлены типы `SpotifySavedAlbum`, `SpotifySavedTrack`, `SpotifyPaged<T>`; функции `getValidSpotifyToken`, `fetchAllSpotifyPaged` |
| `supabase/config.toml` | `[functions.sync-spotify-library] verify_jwt = false` |
| `components/auth/AuthProvider.tsx` | `maybeAutoSync` — авто-синк при старте сессии если библиотека устарела; не блокирует stale active sync навсегда |
| `app/(auth)/sign-in.tsx` | Fire-and-forget `triggerLibrarySync()` после OAuth |
| `app/auth/callback.tsx` | То же — fire-and-forget после OAuth callback |
| `app/_layout.tsx` | `RouterGuard` с `InitialSyncingScreen` для первого синка; повторный sync не возвращает onboarded юзера в splash |
| `app/(tabs)/profile.tsx` | `SyncBanner` + кнопка "Sync library now" + статистика библиотеки |
| `types/database.ts` | Обновлён типом RPC `try_start_library_sync()`; после применения миграции можно перегенерировать из Supabase |

### Удалённые файлы (пивот на Discoveries)

| Файл | Причина |
|------|---------|
| `components/library/LibraryListItem.tsx` | Library UI убран, UI не нужен |
| `components/library/LibrarySearchBar.tsx` | То же |
| `lib/hooks/useLibrary.ts` | То же |
| `app/(tabs)/library.tsx` | Вкладка Library удалена, пивот на Discoveries |
| `app/(tabs)/friends.tsx` | Friends вырезан в v1-scope cut |

---

## 2. Архитектура синка

```
Клиент (sign-in / callback / AuthProvider)
  └── triggerLibrarySync()
        └── POST /functions/sync-spotify-library
              ├── Валидирует JWT через userClient.auth.getUser()
              ├── try_start_library_sync(user_id, started_at)
              │     ├── pg_try_advisory_xact_lock(...) + SELECT FOR UPDATE
              │     ├── если fresh queued/syncing → 202 already_running, новый runSync НЕ стартует
              │     └── иначе status='queued' без сброса aggregated_albums_count
              ├── EdgeRuntime.waitUntil(runSync(...)) если should_start=true
              └── → 202 (клиент не ждёт завершения)

runSync (фон):
  patchSyncStatus(status: 'syncing') ← UPDATE, не upsert
  getValidSpotifyToken() → lazy refresh если истекает через <60s
  fetchAllSpotifyPaged('/me/albums') → savedAlbums[]
    patchSyncStatus(processed_count, total_estimate) на каждой странице
  fetchAllSpotifyPaged('/me/tracks') → savedTracks[]
    patchSyncStatus(...) на каждой странице
    при SYNC_TRACK_LIMIT=N читает максимум N треков, без reconciliation/last_synced_at
  aggregateLibrary(savedAlbums, savedTracks) → AggregatedAlbum[]
    TRACK_THRESHOLD = 4 (треков из альбома чтобы считать альбом "в библиотеке")
  user_library.upsert(rows, {onConflict: 'user_id,provider,provider_album_id'}) по 500 шт
  soft-delete: update removed_at where synced_at < startedAt
  streaming_connections.update(last_synced_at)
  patchSyncStatus(status: 'completed', aggregated_albums_count)

Клиент (useLibrarySyncStatus):
  useQuery → initial fetch
  supabase.channel(sync-status-{userId}-{instanceId})
    postgres_changes → qc.setQueryData(queryKey, next) — мгновенное обновление
  refetchInterval: 2000 пока status in (queued, syncing) — fallback если Realtime недоступен
```

---

## 3. Критические паттерны (выучены болью)

### 3.1 upsert vs update для library_sync_status

**Проблема:** PostgreSQL проверяет `NOT NULL` ограничения **до** разрешения `ON CONFLICT`. Partial `.upsert()` без поля `status` падает на INSERT-фазе даже когда строка уже существует.

**Симптом:** `null value in column "status" violates not-null constraint` в логах Edge Function; синк застревает в `syncing` навсегда; `user_library` остаётся пустой.

**Решение — start RPC + update-only прогресс:**

```ts
// Только для атомарного старта — SQL RPC включает все NOT NULL поля
await admin.rpc('try_start_library_sync', { p_user_id: userId, p_started_at: startedAt });

// Только для прогресс-патчей — UPDATE, не upsert
async function patchSyncStatus(admin, userId, patch, startedAt) {
  await admin
    .from('library_sync_status')
    .update(patch)
    .eq('user_id', userId)
    .eq('started_at', startedAt);
}
```

`try_start_library_sync()` вызывается **один раз** — при создании/перезапуске начальной строки (статус `queued`).
`patchSyncStatus` — все последующие обновления прогресса.
Все `patchSyncStatus` в `runSync` дополнительно фильтруются по `started_at`, чтобы старый stale background job не мог перезаписать статус нового запуска.

### 3.2 Realtime-каналы и useId()

**Проблема:** `supabase-js` переиспользует каналы по имени. Если `useLibrarySyncStatus` монтируется в нескольких компонентах одновременно (например, `SyncBanner` на нескольких экранах), второй вызов `.on()` бросает `cannot add postgres_changes callbacks after subscribe()`.

**Решение:**
```ts
const instanceId = useId(); // React 18+, уникален per mount
const channel = supabase.channel(`sync-status-${userId}-${instanceId}`);
```

### 3.3 Автосинк и Spotify rate limits

**Инцидент:** Баг 3.1 (синк не завершался) + авто-синк без проверки статуса → каскад параллельных `runSync` → сотни запросов к Spotify `/me/tracks` → 429 rate limit на весь `client_id` Development Mode → OAuth `/me` тоже начал возвращать 429 → логин сломан на несколько часов.

**Три защиты в `maybeAutoSync` (`AuthProvider.tsx`):**
1. `if (isActiveLibrarySync(syncRow) && !isStaleLibrarySync(syncRow)) return` — не запускать если уже идёт свежий sync
2. 15-минутный cooldown после `failed` — не долбить API при повторных ошибках
3. `autoSyncedRef = useRef<Set<string>>(new Set())` — не более одного вызова per userId per app session, даже если `session`-объект пересоздаётся

```ts
const AUTO_SYNC_STALE_MS = 24 * 60 * 60 * 1000;
const FAILED_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
```

### 3.4 Soft-delete через synced_at

Вместо `NOT IN (currentIds)` (опасно при больших библиотеках — упирается в длину запроса) используется метка времени:

```ts
const startedAt = new Date().toISOString();
// ...при upsert каждой строки:
synced_at: startedAt  // единое значение для всего синка
// ...после upsert:
await admin
  .from('user_library')
  .update({ removed_at: startedAt })
  .eq('user_id', userId)
  .is('removed_at', null)
  .lt('synced_at', startedAt);  // всё что не было обновлено → помечаем удалённым
```

### 3.5 Server-side dedupe и stale restart

Клиентские guards полезны, но не являются lock'ом. `sync-spotify-library` теперь начинает работу только через `try_start_library_sync()`, которая под advisory lock проверяет строку `library_sync_status`.

- fresh `queued/syncing` → функция возвращает `already_running`, новый Spotify импорт не стартует
- stale `queued/syncing` старше 10 минут → разрешён новый старт
- `aggregated_albums_count` при старте не обнуляется, чтобы повторный sync не включал first-time splash у уже onboarded пользователя
- каждый background run патчит `library_sync_status` только если `started_at` всё ещё совпадает с его timestamp

Клиент использует тот же 10-минутный stale threshold: stale sync больше не дизейблит кнопку в Profile и в initial splash показывается как перезапускаемый.

### 3.6 429 и debug-limit

`fetchAllSpotifyPaged` больше не ретраит 429 бесконечно: максимум 5 попыток, задержка берёт `Retry-After` или exponential backoff с jitter, есть progress logs каждые 10 страниц.

`SYNC_TRACK_LIMIT=N` ограничивает saved tracks для ручной отладки больших аккаунтов. В этом режиме sync пропускает soft-delete reconciliation и не обновляет `last_synced_at`, чтобы частичный импорт не считался полноценным и не пометил реальные альбомы удалёнными.

---

## 4. Что изменилось от плана

| Пункт плана | Факт |
|-------------|------|
| Library tab с FlatList и поиском | ❌ Удалена в пивоте на Discoveries (2026-05-24) |
| SyncBanner на Home и Library | ❌ Только в Profile — остальные экраны не должны его видеть |
| `useLibraryStats` читает из отдельной вьюхи | ✅ Читает `aggregated_albums_count` из `library_sync_status` + `last_synced_at` из `streaming_connections_safe` |
| `useLibrarySyncStatus` — простой `useState` + `useEffect` | ✅ Переписан на react-query (`useQuery` + `refetchInterval` + ручной `qc.setQueryData` в Realtime-хендлере) для консистентности с остальными хуками |
| `useTriggerLibrarySync` инвалидирует `['library']` | ✅ Инвалидирует `['library-sync-status']` + `['library-stats']` (Library UI удалена) |
| `RouterGuard` не был в исходном плане | ✅ Добавлен в `app/_layout.tsx` — блокирует табы `InitialSyncingScreen` пока `aggregated_albums_count == null` и синк активен |
| `InitialSyncingScreen` не был в исходном плане | ✅ Добавлен в `components/onboarding/` — показывает реальный прогресс, кнопку retry при failed |

---

## 5. Схема БД (как применено)

### user_library
```sql
id                  uuid PK
user_id             uuid FK → auth.users ON DELETE CASCADE
provider            text CHECK ('spotify')
provider_album_id   text
mb_release_group_id text (nullable — заполняется в Phase 4)
album_name          text
artist_name         text
cover_url           text
total_tracks        integer
release_year        integer
added_at_provider   timestamptz (NULL для saved-tracks-only альбомов)
source              jsonb  -- { saved_album: bool, saved_tracks_count: int }
synced_at           timestamptz DEFAULT now()
removed_at          timestamptz (soft-delete)
UNIQUE (user_id, provider, provider_album_id)
```

RLS: `select_own` для `authenticated`. Запись — только service role.

### library_sync_status
```sql
user_id             uuid PK FK → auth.users ON DELETE CASCADE
provider            text NOT NULL CHECK ('spotify')
status              text NOT NULL CHECK ('idle'|'queued'|'syncing'|'completed'|'failed')
started_at          timestamptz
completed_at        timestamptz
total_estimate      integer
processed_count     integer NOT NULL DEFAULT 0
saved_albums_count  integer
saved_tracks_count  integer
aggregated_albums_count integer  -- заполняется при completed
error_code          text
error_message       text
updated_at          timestamptz NOT NULL DEFAULT now()
```

Realtime: `alter publication supabase_realtime add table public.library_sync_status`.
RLS: `select_own`. Триггер `touch_library_sync_status` обновляет `updated_at`.

### user_library_active (view)
```sql
SELECT * FROM user_library WHERE removed_at IS NULL
```
Security definer (`security_invoker = false`), явный фильтр `auth.uid() = user_id`.
`GRANT SELECT ON user_library_active TO authenticated`.

---

## 6. RouterGuard — логика

```
session=null               → redirect /(auth)/sign-in
session exists, syncLoading → "Loading music profile..." (избегаем flash для существующих юзеров)
isFirstTimeSync=true       → <InitialSyncingScreen />
иначе                      → <Slot /> (нормальные табы)

isFirstTimeSync = session && !hasCompletedLibrarySync(syncStatus) &&
  (syncStatus == null || status in queued|syncing|failed)
```

`InitialSyncingScreen` показывает:
- `queued` / null → spinner + "Connecting to Spotify..."
- `syncing` → ProgressBar + "Importing N of M"
- `failed` → сообщение об ошибке + кнопка "Try again"
- stale `queued/syncing` старше 10 минут → сообщение "taking longer than expected" + кнопка "Try again"
- Если `status == null` дольше 6 сек → кнопка "Try again" (защита от потерянного запроса)

---

## 7. Тестирование на большом аккаунте (10 000+ треков)

> Подробный план — в `phase-3-library-import.md §6a`.

Реализованные защиты:
- soft-delete через `synced_at < startedAt` безопасен для любого объёма
- `SYNC_TRACK_LIMIT` для ограниченных debug-прогонов без destructive reconciliation
- bounded 429 retry с backoff+jitter
- server-side dedupe fresh active sync'ов
- stale retry после 10 минут

**Регламент при ручном тестировании:**
```sql
-- Сбросить статус перед каждым прогоном
DELETE FROM public.library_sync_status WHERE user_id = auth.uid();
```
Выжидать 10–15 минут между прогонами — Spotify rate-limit окно не мгновенное.

---

## 8. Verified DoD

- ✅ Базовая миграция применена, типы обновлены; hardening-миграцию нужно применить перед деплоем функции
- ✅ Realtime publication включает `library_sync_status`
- ✅ `sync-spotify-library` реализована с фиксом patchSyncStatus; hardening-версию нужно задеплоить после миграции
- ✅ `getValidSpotifyToken` и `fetchAllSpotifyPaged` (401/429 retry) в `_shared/spotify.ts`
- ✅ `TRACK_THRESHOLD = 4` вынесен в константу
- ✅ Profile: "Sync library now" + `SyncBanner` + статистика (N albums tracked · synced Xh ago)
- ✅ `AuthProvider.maybeAutoSync` с тремя защитами от каскада
- ✅ Fire-and-forget initial sync в `sign-in.tsx` и `callback.tsx`
- ✅ `RouterGuard` + `InitialSyncingScreen` с retry
- ✅ Server-side sync dedupe через `try_start_library_sync()`
- ✅ Повторный sync не сбрасывает `aggregated_albums_count` на старте
- ✅ Stale `queued/syncing` можно перезапустить после 10 минут
- ✅ `SYNC_TRACK_LIMIT` безопасен для больших аккаунтов: без reconciliation и `last_synced_at`
- ✅ 429 retry ограничен и использует backoff+jitter
- ✅ `tsc --noEmit` — 0 ошибок
- ✅ Biome lint — 0 ошибок
- ✅ E2E: логин → splash → табы → библиотека импортирована → Profile показывает статистику

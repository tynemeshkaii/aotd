# Discoveries Pivot — session summary

Дата: 2026-05-24

## Что изменилось

- Вкладка `Library` заменена на `Discoveries`.
- `app/(tabs)/discoveries.tsx` теперь показывает placeholder для будущей истории рекомендаций.
- Старый пользовательский UI библиотеки удалён:
  - `components/library/LibraryListItem.tsx`
  - `components/library/LibrarySearchBar.tsx`
  - `lib/hooks/useLibrary.ts`
- `SyncBanner` убран с Home и оставлен только в Profile.
- Profile теперь показывает:
  - Spotify connection status
  - `Library: X albums tracked`
  - `Last synced: Y ago`
  - кнопку `Sync library now`
- Добавлены:
  - `lib/hooks/useLibraryStats.ts`
  - `lib/format.ts`
  - `components/onboarding/InitialSyncingScreen.tsx`

## Initial sync flow

- После OAuth initial sync запускается fire-and-forget из `app/(auth)/sign-in.tsx`.
- Fallback OAuth callback в `app/auth/callback.tsx` тоже запускает initial sync.
- `RouterGuard` в `app/_layout.tsx` блокирует доступ к табам full-screen splash'ем, пока первичный sync ещё не завершён.
- Splash показывается только если `aggregated_albums_count` ещё `null` и статус sync отсутствует, `queued`, `syncing` или `failed`.
- Для существующих пользователей RouterGuard сначала ждёт загрузки `library_sync_status`, чтобы не мигать ложным splash'ем.
- Если строка sync status долго не появляется, `InitialSyncingScreen` показывает кнопку `Try again`.

## Debug / review fixes

- Исправлен риск ложного initial splash для уже синхронизированных пользователей.
- Исправлен пропущенный запуск initial sync в `app/auth/callback.tsx`.
- Исправлена гонка, где `AuthProvider` мог запустить auto-sync до создания Spotify connection row.
- Добавлен recovery path на splash, если sync не создал status row.

## Документация

- Обновлены:
  - `plans/master-plan.md`
  - `plans/phase-3-library-import.md`
  - `README.md`
  - `CLAUDE.md`
- В `CLAUDE.md` добавлено текущее состояние продукта, чтобы будущие изменения не вернули Library tab случайно.
- `plans/discoveries-pivot.md` остаётся главным источником правды для этого pivot.

## Проверки

Пройдены:

```bash
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npx expo install --check
```

## Что ещё проверить вручную

- Logout → Sign in → Spotify consent → возврат в app.
- Initial sync splash появляется и затем исчезает после завершения sync.
- Home открывается без sync banner.
- Discoveries показывает placeholder.
- Profile показывает library stats и ручной sync.
- Повторный sync из Profile не возвращает initial splash.
- Force quit + reopen после успешного sync открывает Home без splash.

## Коммиты

Коммиты в этой сессии не создавались.

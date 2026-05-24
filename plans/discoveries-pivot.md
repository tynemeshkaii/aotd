# Discoveries Pivot — мини-рефакторинг навигации

> Принят 2026-05-24 после ретроспективы фазы 3. Вкладка "Library" удаляется как продуктово бесполезная (дублирует Spotify). На её место — **Discoveries**: лист альбомов, которые наше приложение рекомендовало юзеру.
>
> Сроки: 1–2 часа работы. Делается **между фазой 3 и фазой 4**, до начала планирования алгоритма.
>
> Связан с: [master-plan.md](./master-plan.md), [phase-3-library-import.md](./phase-3-library-import.md).

---

## 0. Что мы делаем и не делаем

| Делаем | Не делаем |
|---|---|
| Переименовать таб `library` → `discoveries` | Удалять `user_library` таблицу или `sync-spotify-library` функцию |
| Удалить UI компоненты библиотеки | Удалять `library_sync_status` или Realtime подписку |
| Сделать **заглушку** Discoveries screen | Реализовывать настоящий список рекомендаций (это фаза 5, когда есть данные алгоритма) |
| Перенести sync банер только в Profile | Менять backend-пайплайн |
| Сделать full-screen splash для **initial** sync после OAuth | Менять flow для последующих ручных/автосинков |
| Перенести статус библиотеки в Profile тонкой строкой | Менять onboarding для уже залогиненного юзера |

---

## 1. UX flow после изменений

### Новый пользователь (после OAuth)
```
Sign in screen → Spotify consent → возврат в app
   ↓
Full-screen splash "Building your music profile…"
   с прогресс-баром (240 / 847) и анимацией
   ↓ (когда status='completed')
Transition в Home tab (карточка альбома дня — пока заглушка)
   ↓
Юзер может тапнуть Discoveries → пустой state "Your first discovery comes tomorrow"
```

### Существующий пользователь (открыл приложение)
```
Cold start → AuthProvider восстанавливает сессию
   ↓
Direct в Home tab. Без splash, без банера
   ↓
В фоне: если last_synced_at > 24ч → автосинк (без UI)
   ↓
Если sync завершился ошибкой — увидит в Profile (банер с retry)
```

### Profile tab всегда
```
Avatar + display name
Spotify connected · 2 days ago
Library: 432 albums tracked
Last synced: 6h ago
[Sync library now]   ← кнопка как сейчас
[SyncBanner]         ← здесь, если идёт sync или была ошибка
[Log out]
```

---

## 2. Пошаговая реализация

### Шаг 1 — Переименовать таб и удалить UI-компоненты библиотеки

**Файловые операции:**
- `git mv app/(tabs)/library.tsx app/(tabs)/discoveries.tsx`
- Удалить:
  - `components/library/LibraryList.tsx`
  - `components/library/LibraryListItem.tsx`
  - `components/library/LibrarySearchBar.tsx`
  - `lib/hooks/useLibrary.ts`
- **НЕ удалять:**
  - `components/library/SyncBanner.tsx`
  - `components/ui/ProgressBar.tsx`
  - `lib/hooks/useLibrarySyncStatus.ts`
  - `lib/hooks/useTriggerLibrarySync.ts`
  - `lib/library.ts`

**Обновить таб-конфиг:**

В `app/(tabs)/_layout.tsx` заменить регистрацию таба:
```tsx
<Tabs.Screen
  name="discoveries"
  options={{
    title: 'Discoveries',
    tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" color={color} size={size} />,
  }}
/>
```
(было `name="library"` с иконкой `library`)

---

### Шаг 2 — Заглушка Discoveries screen

`app/(tabs)/discoveries.tsx` целиком переписать:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function DiscoveriesScreen() {
  return (
    <Screen scroll={false}>
      <Text variant="h1">Discoveries</Text>
      <Text variant="caption" className="mt-1 mb-8">
        Albums we recommended to you
      </Text>

      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-6 items-center justify-center rounded-full bg-surface p-6">
          <Ionicons name="sparkles" size={48} color="#1db954" />
        </View>
        <Text variant="h2" className="text-center">
          Your first discovery is coming
        </Text>
        <Text variant="caption" className="mt-3 text-center leading-5">
          Each morning we'll pick one album you don't have yet, based on your taste. Check back
          tomorrow.
        </Text>
      </View>
    </Screen>
  );
}
```

Никакого `SyncBanner`, никакого `useLibrary`. Чистая заглушка.

---

### Шаг 3 — Убрать SyncBanner с Home

В `app/(tabs)/index.tsx`:
- Удалить импорт `SyncBanner`
- Удалить `<SyncBanner />` из JSX
- Home теперь содержит только то, что должно быть на Home (карточка-заглушка для альбома дня, как раньше)

---

### Шаг 4 — Расширить Profile

`app/(tabs)/profile.tsx` обновить:

- Добавить запрос `useLibraryStats` (новый хук, см. ниже)
- Добавить статус-строки между connection info и кнопкой sync:
  - `Library: {aggregated_albums_count} albums tracked`
  - `Last synced: {relativeTime(last_synced_at)}`
- Перенести `<SyncBanner />` в Profile (был на Home/Library/Profile — теперь только Profile)

**Новый хук `lib/hooks/useLibraryStats.ts`:**

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/auth/AuthProvider';

export function useLibraryStats() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['library-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Берём из library_sync_status (там уже есть aggregated_albums_count)
      const { data: status } = await supabase
        .from('library_sync_status')
        .select('aggregated_albums_count')
        .eq('user_id', userId!)
        .maybeSingle();

      // last_synced_at из streaming_connections_safe (мы его туда положили в фазе 2)
      const { data: conn } = await supabase
        .from('streaming_connections_safe')
        .select('last_synced_at')
        .eq('provider', 'spotify')
        .maybeSingle();

      return {
        albumsTracked: status?.aggregated_albums_count ?? null,
        lastSyncedAt: conn?.last_synced_at ?? null,
      };
    },
  });
}
```

**Утилита `lib/format.ts`** (если ещё нет) для `relativeTime`:
```ts
export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
```

---

### Шаг 5 — Initial sync splash после OAuth

**Стратегия:** расширить `RouterGuard` в `app/_layout.tsx`. Если есть сессия и идёт **первичный** sync (определяем как `library_sync_status.status in ('queued', 'syncing')` И `aggregated_albums_count IS NULL`) — рендерим full-screen splash вместо табов. Тапы по табам становятся невозможны (Slot не рендерится).

**Логика определения "first-time sync":**
| Условие | Что показываем |
|---|---|
| Нет строки `library_sync_status` | Initial sync ещё не стартанул (но скоро — `triggerLibrarySync()` вызывается из sign-in). Показываем splash с "Starting…" |
| `status='queued'` или `status='syncing'`, `aggregated_albums_count IS NULL` | Активный первичный sync. Splash с прогрессом |
| `status='failed'`, `aggregated_albums_count IS NULL` | Первичный sync упал. Splash с error UI и кнопкой "Try again" |
| `aggregated_albums_count` не null (когда-то завершался успешно) | Это уже не первичный sync. Скрываем splash, идём в табы. Активный повторный sync виден только в Profile |

**Новый компонент `components/onboarding/InitialSyncingScreen.tsx`:**

```tsx
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { useTriggerLibrarySync } from '@/lib/hooks/useTriggerLibrarySync';

export function InitialSyncingScreen() {
  const { status } = useLibrarySyncStatus();
  const retry = useTriggerLibrarySync();

  const total = status?.total_estimate ?? 0;
  const processed = status?.processed_count ?? 0;
  const ratio = total > 0 ? Math.min(processed / total, 1) : 0;

  const isFailed = status?.status === 'failed';
  const isStarting = !status || status.status === 'queued';

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <View className="mb-8 items-center justify-center rounded-full bg-surface p-6">
        <Ionicons name="musical-notes" size={56} color="#1db954" />
      </View>

      {isFailed ? (
        <>
          <Text variant="h2" className="text-center">
            We couldn't read your library
          </Text>
          <Text variant="caption" className="mt-3 mb-8 text-center leading-5">
            {status.error_message ?? 'Unknown error'}
          </Text>
          <Button
            title={retry.isPending ? 'Retrying…' : 'Try again'}
            variant="primary"
            disabled={retry.isPending}
            onPress={() => retry.mutate()}
          />
        </>
      ) : (
        <>
          <Text variant="h2" className="text-center">
            Building your music profile
          </Text>
          <Text variant="caption" className="mt-3 mb-8 text-center leading-5">
            {isStarting
              ? "Connecting to Spotify…"
              : `Importing ${processed} of ${total || '?'} items`}
          </Text>
          {!isStarting && total > 0 ? (
            <View className="w-full max-w-xs">
              <ProgressBar ratio={ratio} />
            </View>
          ) : (
            <ActivityIndicator />
          )}
        </>
      )}
    </View>
  );
}
```

**Обновить `app/_layout.tsx` → `RouterGuard`:**

```tsx
function RouterGuard() {
  const { session, loading } = useSession();
  const { status: syncStatus } = useLibrarySyncStatus();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/sign-in');
    if (session && inAuthGroup) router.replace('/(tabs)');
  }, [loading, router, segments, session]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Text variant="caption">Loading session…</Text>
      </View>
    );
  }

  // Первичный sync: блокируем доступ к табам пока не завершится
  const isFirstTimeSync =
    !!session &&
    (syncStatus?.aggregated_albums_count == null) &&
    (syncStatus == null ||
      syncStatus.status === 'queued' ||
      syncStatus.status === 'syncing' ||
      syncStatus.status === 'failed');

  if (isFirstTimeSync) {
    return <InitialSyncingScreen />;
  }

  return <Slot />;
}
```

**Важно:** `useLibrarySyncStatus` сейчас уже подписан на Realtime — при `status='completed'` компонент перерисуется, `isFirstTimeSync` станет `false`, и `<Slot />` смонтируется → юзер увидит табы. Smooth transition.

**Edge case:** если юзер закрыл приложение во время первичного sync и открыл снова — мы попадём на тот же splash, потому что `aggregated_albums_count` всё ещё null. Это правильное поведение — мы не хотим показывать пустые Home/Discoveries.

---

### Шаг 6 — Подчистить sign-in flow

В `app/(auth)/sign-in.tsx` сейчас после OAuth вызывается `void triggerLibrarySync()` fire-and-forget. Это работает, но добавим явный fallback:

```ts
const session = await signInWithSpotify();
await syncSpotifyConnection(session);
// Initial sync — fire and forget. Splash подхватит статус через Realtime.
triggerLibrarySync().catch((e) => {
  if (__DEV__) console.warn('[initial-sync] failed', e);
});
```

После этого router сам переключит на `(tabs)`, но `RouterGuard` обнаружит `isFirstTimeSync = true` и покажет `InitialSyncingScreen`.

---

### Шаг 7 — Обновить документацию

**`plans/master-plan.md`:**

§5 фаза 3 — обновить текст:
```
- Edge Function `sync-spotify-library` импортирует Saved Albums + Saved Tracks
- Агрегация через `TRACK_THRESHOLD = 4`
- Background-выполнение через `EdgeRuntime.waitUntil`, прогресс через Realtime
- **Discoveries pivot:** UI-вкладки Library нет — данные используются только алгоритмом
  и видны в Profile как статус
- Initial sync блокирует доступ к табам full-screen splash'ем
- Автосинк раз в 24ч в фоне (без UI)
```

§9 (открытые вопросы) — отметить решённым:
```
- [x] Структура нижней навигации: Home / Discoveries / Friends / Profile.
      "Library" удалён как продуктово бесполезный. Импорт виден в Profile
      как статус (2026-05-24).
- [x] Учитывать ли Spotify playlists юзера: решено в фазе 3 — только Saved Albums
      + Saved Tracks с агрегацией через TRACK_THRESHOLD=4.
```

§5 фаза 5 (карточка альбома и оценки) — добавить:
```
- Реализация полноценного Discoveries screen: список прошлых albums_of_the_day
  с LEFT JOIN на ratings, статус-бейджи (rated/skipped/listening/pending),
  сортировка по date desc
```

**`plans/phase-3-library-import.md`:**

В §3 (Definition of Done) добавить новый блок в конце:
```
### Post-pivot (применили после ретроспективы):
- [ ] UI-вкладка Library удалена, заменена на заглушку Discoveries
- [ ] Sync banner вынесен только в Profile
- [ ] Initial sync блокирует табы full-screen splash'ем
- [ ] Статус библиотеки виден в Profile (`X albums tracked · synced Yh ago`)
```

---

### Шаг 8 — Проверки

```bash
npm run lint
npm run typecheck
```

**E2E на устройстве (когда Spotify rate limit рассосётся):**

1. Logout (если залогинен)
2. Sign in → Spotify consent → возврат
3. Сразу видишь **full-screen splash** "Building your music profile…" с анимацией / индикатором
4. Через 1–2 сек splash показывает реальный прогресс (240 / 847)
5. Когда sync завершён (5–10 сек) — splash исчезает, ты в Home
6. Tap Discoveries → видишь пустой state "Your first discovery is coming"
7. Tap Profile → видишь "Library: 432 albums tracked · synced just now", банер не виден
8. Tap "Sync library now" в Profile → банер появляется только тут, splash не возвращается
9. Force-quit + reopen приложения → попадаешь сразу в Home, splash не показывается (потому что `aggregated_albums_count` уже не null)

---

### Шаг 9 — Коммит

Один коммит:
```
refactor: pivot from Library tab to Discoveries

- Replace Library tab with Discoveries placeholder
- Move sync banner to Profile only
- Add full-screen InitialSyncingScreen for first-time sync after OAuth
- Add library stats to Profile (albums tracked, last synced)
- Backend pipeline (user_library, sync-spotify-library, library_sync_status)
  unchanged — data is consumed by algorithm in phase 4
```

И отдельный docs-коммит:
```
docs: discoveries pivot plan + master-plan updates
```

---

## 3. Definition of Done — Pivot

- [ ] Таб переименован `library` → `discoveries`
- [ ] UI-компоненты `LibraryList*` и `useLibrary` удалены
- [ ] `SyncBanner` остался только в Profile
- [ ] `InitialSyncingScreen` показывается только при `aggregated_albums_count IS NULL` + active sync
- [ ] Profile показывает `albums tracked` и `last synced`
- [ ] Backend (миграции, Edge Functions, `streaming_connections_safe`, `library_sync_status`) **не тронут**
- [ ] `npm run lint` и `npm run typecheck` зелёные
- [ ] E2E прошёл (9 шагов выше)
- [ ] Документы обновлены: master-plan §5, §9, phase-3 DoD
- [ ] Два коммита: refactor + docs

---

## 4. Задача для Claude Code

Один промпт целиком:

> _"Открой plans/discoveries-pivot.md. Это мини-рефакторинг — удалить Library tab и заменить на Discoveries placeholder, добавить InitialSyncingScreen после OAuth, перенести sync banner в Profile, добавить статус библиотеки в Profile._
>
> _Сделай шаги 1–7 по порядку. Backend (миграции, Edge Functions, supabase/) не трогай — только UI и хуки. После шага 7 покажи мне `git status` и `git diff --stat`, не коммить пока сам не проверю на телефоне._
>
> _Перед написанием новых компонентов проверь как уже устроены существующие (`components/ui/Screen`, `Button`, `Text`, `ProgressBar`) и используй тот же стиль. Лонгранн: lint + typecheck должны быть зелёными после каждого крупного шага. Не давай мне зелёный свет пока не проверишь."_

После того как Claude Code сделает изменения и я подтвержу e2e на телефоне — он же делает шаги 8 и 9 (коммиты).

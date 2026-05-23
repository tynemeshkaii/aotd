# Фаза 3 — Импорт библиотеки Spotify

> Детальный план реализации. Опирается на [master-plan.md](./master-plan.md) §5 (фаза 3).
> Сроки: 1.5–2 недели (10–14 рабочих сессий).
> Цель: после успешного OAuth (фаза 2) приложение в фоне импортирует библиотеку юзера из Spotify (сохранённые альбомы + сохранённые треки, агрегированные в альбомы). Пользователь сразу видит Home/Library, наверху — банер прогресса с реальным числом. По окончании банер исчезает, в Library — отсортированный список альбомов с поиском. Кнопка "Sync" в Profile запускает повторную синхронизацию. Автосинк раз в 24 часа при открытии приложения.

---

## 0. Технические решения (зафиксированы)

| Что | Выбор | Почему |
|---|---|---|
| Что импортируем | **Saved Albums + Saved Tracks → агрегация в альбомы** | По твоему выбору. Saved Albums — явная семантика "альбом в библиотеке". Saved Tracks — дополнительный сигнал: если пользователь сохранил N+ треков из одного альбома, считаем альбом тоже "в библиотеке" |
| Порог треков | **`TRACK_THRESHOLD = 4`** (вынесен в константу) | 4 трека из типичного альбома 10–12 треков (~35%) = осознанное знакомство с альбомом. 1–3 трека — "понравилась песня", не "слушал альбом". Подкручиваем после данных бети |
| Запуск первого синка | **На фоне, банер с прогрессом** | Edge Function стартует `EdgeRuntime.waitUntil(...)`, возвращает 202 моментально. Клиент подписывается на Realtime канал к строке `library_sync_status`. Юзер сразу в Home, наверху "Importing 240/847..." |
| Где живёт sync-логика | **Edge Function `sync-spotify-library`** | Не клиент: токены централизованы, в будущем (фаза 4) функцию вызывает cron. Один источник правды |
| MusicBrainz dedup | **НЕ делаем в фазе 3** | Изначально в мастер-плане был заявлен в фазе 3, но: 500 альбомов × 1s rate limit MB = 8+ минут sync. Это убьёт background UX. Переносим MB enrichment на фазу 4, где он реально нужен для алгоритма. Сейчас храним `mb_release_group_id` как nullable |
| Дедупликация внутри Spotify | **Spotify album ID + ключ `(provider, provider_album_id)`** | Достаточно для фазы 3. Тот же альбом из Saved Albums и Saved Tracks мёрджится в одну строку с `source: { saved_album: true, saved_tracks_count: 7 }` |
| Стратегия sync — full или incremental | **Full sync** | Spotify не даёт "changed since" для библиотеки. Full sync 500 альбомов ~5 сек, 30 HTTP-запросов — приемлемо. Incremental — оптимизация на потом |
| Reconciliation удалений | **Soft-delete: `removed_at` колонка** | Если юзер удалил альбом из Spotify, мы помечаем `removed_at = now()` и больше не показываем в Library. Не удаляем строку — может пригодиться для аналитики и для алгоритма ("ты убирал этот альбом — не предлагать") |
| Прогресс sync | Таблица `library_sync_status` + **Realtime subscription** | Одна строка на юзера. Edge Function пишет туда `processed_count`, `total_estimate`, `status`. Клиент подписан на изменения. Без polling |
| Авто-sync | **При открытии приложения если `last_synced_at` старше 24ч** | Не cron на сервере (это в фазе 4). Простая проверка в `AuthProvider` после установки сессии: если stale — invoke функции |
| Ручной sync | Кнопка в Profile "Sync library now" | Та же Edge Function, тот же flow с прогресс-банером |
| UX списка | Простой `FlatList` с поиском, сортировка по `added_at_provider desc` | Без секций по жанрам/декадам в MVP. Search — client-side `includes()` по name+artist |
| Token refresh внутри Edge Function | **Lazy через helper `getValidSpotifyToken(admin, user_id)`** | Если `token_expires_at < now()+60s` — рефрешим перед началом работы. Если 401 от Spotify посреди sync — рефрешим и retry один раз |

---

## 1. Что меняется в проекте

### 1.1. Новые файлы / папки

```
app/
└── (tabs)/
    ├── index.tsx                         # ← обновляется: показывает SyncBanner если sync активен
    ├── library.tsx                       # ← переписывается: реальный список
    └── profile.tsx                       # ← обновляется: кнопка Sync now

components/
├── library/
│   ├── SyncBanner.tsx                    # ← новый: банер прогресса наверху Home/Library
│   ├── LibraryList.tsx                   # ← новый: FlatList с альбомами
│   ├── LibraryListItem.tsx               # ← новый: одна строка
│   └── LibrarySearchBar.tsx              # ← новый: поиск
└── ui/
    └── ProgressBar.tsx                   # ← новый: тонкая полоска прогресса

lib/
├── hooks/
│   ├── useLibrary.ts                     # ← новый: react-query запрос user_library
│   ├── useLibrarySyncStatus.ts           # ← новый: Realtime подписка на library_sync_status
│   └── useTriggerLibrarySync.ts          # ← новый: mutation для запуска sync
└── library.ts                            # ← новый: triggerLibrarySync helper

supabase/
├── migrations/
│   └── 20260606000000_user_library_and_sync_status.sql   # ← новая миграция
└── functions/
    ├── _shared/
    │   ├── spotify.ts                    # ← расширяется: pagination, getValidSpotifyToken
    │   └── library-aggregation.ts        # ← новый: чистая функция агрегации
    └── sync-spotify-library/
        ├── index.ts
        └── deno.json
```

### 1.2. Изменения в существующих файлах

- `components/auth/AuthProvider.tsx` — после установки сессии триггерит `triggerLibrarySync()` если `last_synced_at` старше 24ч или null
- `lib/auth.ts` — `syncSpotifyConnection()` после успеха возвращает не void, а позволяет дальше дёрнуть начальный sync
- `app/(auth)/sign-in.tsx` — после `syncSpotifyConnection` дополнительно вызывает `triggerLibrarySync(initial: true)` и переходит на Home (не ждёт окончания sync)
- `types/database.ts` — регенерируется после миграции
- `supabase/config.toml` — `[functions.sync-spotify-library] verify_jwt = false` (по той же причине что и другие функции — сами валидируем)

---

## 2. Пошаговая реализация

### Шаг 1 — Миграция: user_library + library_sync_status

`supabase/migrations/<ts>_user_library_and_sync_status.sql`:

```sql
-- Phase 3: библиотека пользователя из Spotify (+ saved tracks → альбомы)
-- и состояние синхронизации (для Realtime прогресса).

create table public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_album_id text not null,
  mb_release_group_id text,                       -- заполняется в фазе 4 (MB enrichment)
  album_name text not null,
  artist_name text not null,
  cover_url text,                                 -- удобно сразу хранить — придёт от Spotify
  total_tracks integer,
  release_year integer,
  added_at_provider timestamptz,                  -- когда юзер сохранил в Spotify (NULL для saved-tracks-only)
  source jsonb not null default '{}'::jsonb,
  -- source schema:
  -- { "saved_album": bool, "saved_tracks_count": int }
  synced_at timestamptz not null default now(),
  removed_at timestamptz,                         -- soft-delete, если пропал из Spotify
  unique (user_id, provider, provider_album_id)
);

create index user_library_user_idx on public.user_library(user_id);
create index user_library_user_active_idx
  on public.user_library(user_id)
  where removed_at is null;
create index user_library_mb_idx on public.user_library(mb_release_group_id)
  where mb_release_group_id is not null;

alter table public.user_library enable row level security;

create policy "user_library_select_own"
  on public.user_library
  for select
  using (auth.uid() = user_id);
-- Insert/update только через Edge Function (service role) — клиенту не даём права на запись

-- Состояние синхронизации — одна строка на юзера, обновляется Edge Function
create table public.library_sync_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  status text not null check (status in ('idle', 'queued', 'syncing', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  total_estimate integer,                         -- сколько ожидаем (приблизительно)
  processed_count integer not null default 0,
  saved_albums_count integer,                     -- разбивка для UX
  saved_tracks_count integer,
  aggregated_albums_count integer,                -- финальное число альбомов после агрегации
  error_code text,
  error_message text,
  updated_at timestamptz not null default now()
);

alter table public.library_sync_status enable row level security;

create policy "library_sync_status_select_own"
  on public.library_sync_status
  for select
  using (auth.uid() = user_id);

-- Включаем Realtime publication для этой таблицы (чтобы клиент мог слушать)
alter publication supabase_realtime add table public.library_sync_status;

-- Обновлять updated_at автоматически
create or replace function public.touch_library_sync_status()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger library_sync_status_touch
  before update on public.library_sync_status
  for each row execute procedure public.touch_library_sync_status();

-- Удобный view для клиента: считать сколько активных альбомов в библиотеке
create view public.user_library_active as
  select * from public.user_library
  where removed_at is null;

grant select on public.user_library_active to authenticated;
```

**Применить:**
```bash
supabase migration new user_library_and_sync_status
# вставить SQL
supabase db push
npm run db:types
```

**Точка проверки:**
- В Supabase Dashboard → Table Editor видны `user_library` и `library_sync_status`
- Realtime → Inspector показывает `library_sync_status` в публикации
- Клиентский `select` на `user_library` пустой (RLS пускает но строк нет)

---

### Шаг 2 — Edge Function infrastructure

```bash
supabase functions new sync-spotify-library
```

В `supabase/config.toml` добавить:
```toml
[functions.sync-spotify-library]
verify_jwt = false
```

В `supabase/functions/sync-spotify-library/deno.json` — те же импорты что в `refresh-spotify-token`:
```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

---

### Шаг 3 — Расширить `_shared/spotify.ts`

Добавить (к существующим `fetchSpotifyProfile`, `refreshSpotifyAccessToken`):

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type SpotifySavedAlbum = {
  added_at: string;
  album: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    images: { url: string }[];
    release_date: string;
    total_tracks: number;
  };
};

export type SpotifySavedTrack = {
  added_at: string;
  track: {
    album: {
      id: string;
      name: string;
      artists: { id: string; name: string }[];
      images: { url: string }[];
      release_date: string;
      total_tracks: number;
    };
  };
};

export type SpotifyPaged<T> = {
  items: T[];
  next: string | null;
  total: number;
};

const SPOTIFY_API = 'https://api.spotify.com/v1';

/**
 * Получить валидный access_token для юзера. Если истёк — рефрешит и обновляет БД.
 */
export async function getValidSpotifyToken(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('streaming_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single();
  if (error || !data) throw new Error('connection_not_found');

  const expiresAt = new Date(data.token_expires_at).getTime();
  const isExpiringSoon = expiresAt - Date.now() < 60_000;

  if (!isExpiringSoon) return data.access_token;

  const refreshed = await refreshSpotifyAccessToken(data.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await admin
    .from('streaming_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('user_id', userId)
    .eq('provider', 'spotify');

  return refreshed.access_token;
}

/**
 * Универсальная Spotify-страничная загрузка с авто-retry на 401 (rotate token) и 429 (rate limit).
 */
export async function fetchAllSpotifyPaged<T>(
  endpoint: string,
  initialToken: string,
  onPage: (page: SpotifyPaged<T>) => Promise<void> | void,
  refreshToken: () => Promise<string>,
): Promise<{ totalFetched: number }> {
  let token = initialToken;
  let url: string | null = `${SPOTIFY_API}${endpoint}?limit=50`;
  let totalFetched = 0;
  let retriedAuth = false;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      token = await refreshToken();
      continue;
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`spotify_paged_failed:${res.status}`);
    }

    const page = (await res.json()) as SpotifyPaged<T>;
    await onPage(page);
    totalFetched += page.items.length;
    url = page.next;
    retriedAuth = false;
  }

  return { totalFetched };
}
```

---

### Шаг 4 — Чистая функция агрегации

`supabase/functions/_shared/library-aggregation.ts`:

```ts
import type { SpotifySavedAlbum, SpotifySavedTrack } from './spotify.ts';

export const TRACK_THRESHOLD = 4;

export type AggregatedAlbum = {
  provider_album_id: string;
  album_name: string;
  artist_name: string;
  cover_url: string | null;
  total_tracks: number | null;
  release_year: number | null;
  added_at_provider: string | null;
  source: { saved_album: boolean; saved_tracks_count: number };
};

export function aggregateLibrary(
  savedAlbums: SpotifySavedAlbum[],
  savedTracks: SpotifySavedTrack[],
): AggregatedAlbum[] {
  const map = new Map<string, AggregatedAlbum>();

  for (const item of savedAlbums) {
    const a = item.album;
    map.set(a.id, {
      provider_album_id: a.id,
      album_name: a.name,
      artist_name: a.artists[0]?.name ?? 'Unknown',
      cover_url: a.images[0]?.url ?? null,
      total_tracks: a.total_tracks ?? null,
      release_year: parseReleaseYear(a.release_date),
      added_at_provider: item.added_at,
      source: { saved_album: true, saved_tracks_count: 0 },
    });
  }

  for (const item of savedTracks) {
    const a = item.track.album;
    const existing = map.get(a.id);
    if (existing) {
      existing.source.saved_tracks_count += 1;
    } else {
      map.set(a.id, {
        provider_album_id: a.id,
        album_name: a.name,
        artist_name: a.artists[0]?.name ?? 'Unknown',
        cover_url: a.images[0]?.url ?? null,
        total_tracks: a.total_tracks ?? null,
        release_year: parseReleaseYear(a.release_date),
        added_at_provider: null,
        source: { saved_album: false, saved_tracks_count: 1 },
      });
    }
  }

  return Array.from(map.values()).filter(
    (a) => a.source.saved_album || a.source.saved_tracks_count >= TRACK_THRESHOLD,
  );
}

function parseReleaseYear(releaseDate: string): number | null {
  const year = Number.parseInt(releaseDate?.slice(0, 4) ?? '', 10);
  return Number.isFinite(year) ? year : null;
}
```

Чистая функция — тестируется отдельно (тесты — фаза 4 по плану, но можно набросать `_test.ts` сразу).

---

### Шаг 5 — Edge Function `sync-spotify-library`

`supabase/functions/sync-spotify-library/index.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import {
  fetchAllSpotifyPaged,
  getValidSpotifyToken,
  refreshSpotifyAccessToken,
  type SpotifySavedAlbum,
  type SpotifySavedTrack,
} from '../_shared/spotify.ts';
import { aggregateLibrary } from '../_shared/library-aggregation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'missing_auth');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonError(401, 'invalid_user');

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Сразу пишем 'queued' и возвращаем 202
    await upsertSyncStatus(admin, user.id, { status: 'queued', started_at: new Date().toISOString() });

    // Запускаем фоновое выполнение — клиенту отдаём управление сразу
    EdgeRuntime.waitUntil(runSync(admin, user.id));

    return jsonResponse({ ok: true, status: 'queued' }, { status: 202 });
  } catch (e) {
    return jsonError(500, 'unexpected', String(e));
  }
});

async function runSync(admin: SupabaseClient, userId: string) {
  try {
    await upsertSyncStatus(admin, userId, { status: 'syncing', processed_count: 0 });

    const token = await getValidSpotifyToken(admin, userId);

    const savedAlbums: SpotifySavedAlbum[] = [];
    const savedTracks: SpotifySavedTrack[] = [];

    // Pull saved albums
    await fetchAllSpotifyPaged<SpotifySavedAlbum>(
      '/me/albums',
      token,
      async (page) => {
        savedAlbums.push(...page.items);
        await upsertSyncStatus(admin, userId, {
          total_estimate: page.total,
          processed_count: savedAlbums.length,
          saved_albums_count: savedAlbums.length,
        });
      },
      () => getValidSpotifyToken(admin, userId),
    );

    // Pull saved tracks
    await fetchAllSpotifyPaged<SpotifySavedTrack>(
      '/me/tracks',
      token,
      async (page) => {
        savedTracks.push(...page.items);
        await upsertSyncStatus(admin, userId, {
          total_estimate: savedAlbums.length + page.total,
          processed_count: savedAlbums.length + savedTracks.length,
          saved_tracks_count: savedTracks.length,
        });
      },
      () => getValidSpotifyToken(admin, userId),
    );

    // Aggregate
    const aggregated = aggregateLibrary(savedAlbums, savedTracks);

    // Upsert в user_library (chunks по 500 чтобы не упереться в лимиты)
    const now = new Date().toISOString();
    const rows = aggregated.map((a) => ({
      user_id: userId,
      provider: 'spotify' as const,
      provider_album_id: a.provider_album_id,
      album_name: a.album_name,
      artist_name: a.artist_name,
      cover_url: a.cover_url,
      total_tracks: a.total_tracks,
      release_year: a.release_year,
      added_at_provider: a.added_at_provider,
      source: a.source,
      synced_at: now,
      removed_at: null,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin
        .from('user_library')
        .upsert(chunk, { onConflict: 'user_id,provider,provider_album_id' });
      if (error) throw new Error(`db_upsert_failed:${error.message}`);
    }

    // Soft-delete всё что мы НЕ обновили в этот sync
    const currentIds = aggregated.map((a) => a.provider_album_id);
    await admin
      .from('user_library')
      .update({ removed_at: now })
      .eq('user_id', userId)
      .eq('provider', 'spotify')
      .is('removed_at', null)
      .not('provider_album_id', 'in', `(${currentIds.map((id) => `"${id}"`).join(',')})`);
    // Альтернатива: stamp synced_at и удалять по synced_at < started_at — безопаснее для огромных библиотек

    // Update last_synced_at в streaming_connections
    await admin
      .from('streaming_connections')
      .update({ last_synced_at: now })
      .eq('user_id', userId)
      .eq('provider', 'spotify');

    await upsertSyncStatus(admin, userId, {
      status: 'completed',
      completed_at: now,
      aggregated_albums_count: aggregated.length,
    });
  } catch (e) {
    await upsertSyncStatus(admin, userId, {
      status: 'failed',
      error_code: 'sync_failed',
      error_message: e instanceof Error ? e.message : String(e),
      completed_at: new Date().toISOString(),
    });
  }
}

async function upsertSyncStatus(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
) {
  await admin.from('library_sync_status').upsert(
    { user_id: userId, provider: 'spotify', ...patch },
    { onConflict: 'user_id' },
  );
}
```

> **Важно:** в большой библиотеке (>5000 треков) soft-delete через `not in (...)` упрётся в длину запроса. Безопаснее: ставить `synced_at = started_at` в upsert, потом `update set removed_at = now() where synced_at < started_at`. Реализовать сразу.

**Деплой:**
```bash
supabase functions deploy sync-spotify-library
```

---

### Шаг 6 — Клиентский слой: hooks

**`lib/library.ts`:**
```ts
import { supabase } from './supabase';

export async function triggerLibrarySync(): Promise<void> {
  const { error } = await supabase.functions.invoke('sync-spotify-library', { body: {} });
  if (error) throw error;
}
```

**`lib/hooks/useLibrarySyncStatus.ts`:**
```ts
import { useEffect, useState } from 'react';
import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/auth/AuthProvider';

type SyncStatus = Database['public']['Tables']['library_sync_status']['Row'];

export function useLibrarySyncStatus(): { status: SyncStatus | null; loading: boolean } {
  const { session } = useSession();
  const userId = session?.user.id;
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;

    supabase
      .from('library_sync_status')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) {
          setStatus(data);
          setLoading(false);
        }
      });

    const channel = supabase
      .channel(`sync-status-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'library_sync_status',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setStatus(payload.new as SyncStatus);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { status, loading };
}
```

**`lib/hooks/useLibrary.ts`:**
```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/auth/AuthProvider';

export function useLibrary(searchQuery = '') {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['library', userId, searchQuery],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase
        .from('user_library_active')
        .select('id, provider_album_id, album_name, artist_name, cover_url, added_at_provider')
        .eq('user_id', userId!)
        .order('added_at_provider', { ascending: false, nullsFirst: false })
        .limit(1000);

      if (searchQuery.trim()) {
        const term = `%${searchQuery.trim()}%`;
        q = q.or(`album_name.ilike.${term},artist_name.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

**`lib/hooks/useTriggerLibrarySync.ts`:**
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerLibrarySync } from '@/lib/library';

export function useTriggerLibrarySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerLibrarySync,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}
```

---

### Шаг 7 — `SyncBanner` компонент

`components/library/SyncBanner.tsx`:

```tsx
import { View } from 'react-native';
import { useLibrarySyncStatus } from '@/lib/hooks/useLibrarySyncStatus';
import { Text } from '@/components/ui/Text';
import { ProgressBar } from '@/components/ui/ProgressBar';

export function SyncBanner() {
  const { status } = useLibrarySyncStatus();
  if (!status || status.status === 'idle' || status.status === 'completed') return null;

  if (status.status === 'failed') {
    return (
      <View className="bg-red-900/40 px-4 py-3 mx-4 mt-2 rounded-xl">
        <Text variant="caption">
          Sync failed: {status.error_message ?? 'unknown'}. Try again from Profile.
        </Text>
      </View>
    );
  }

  const total = status.total_estimate ?? 0;
  const processed = status.processed_count ?? 0;
  const ratio = total > 0 ? Math.min(processed / total, 1) : 0;

  return (
    <View className="bg-surface px-4 py-3 mx-4 mt-2 rounded-xl">
      <Text variant="caption" className="mb-2">
        Importing your library… {processed} / {total || '?'}
      </Text>
      <ProgressBar ratio={ratio} />
    </View>
  );
}
```

**`components/ui/ProgressBar.tsx`** — простая полоска через NativeWind, без анимаций пока.

---

### Шаг 8 — `app/(tabs)/library.tsx`

```tsx
import { useState } from 'react';
import { FlatList, View, ActivityIndicator } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { SyncBanner } from '@/components/library/SyncBanner';
import { LibrarySearchBar } from '@/components/library/LibrarySearchBar';
import { LibraryListItem } from '@/components/library/LibraryListItem';
import { useLibrary } from '@/lib/hooks/useLibrary';

export default function LibraryScreen() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useLibrary(query);

  return (
    <Screen scroll={false}>
      <Text variant="h1" className="mb-4">Library</Text>
      <SyncBanner />
      <LibrarySearchBar value={query} onChange={setQuery} />
      {isLoading ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LibraryListItem item={item} />}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <Text variant="caption" className="mt-12 text-center">
              Library is empty. Saved albums in Spotify will appear here after sync.
            </Text>
          }
          contentContainerClassName="pb-20"
        />
      )}
    </Screen>
  );
}
```

`LibraryListItem` — обложка 56×56, два ряда текста (название + артист), без действий пока. В фазе 5 — tap → карточка альбома.

---

### Шаг 9 — Изменения в `Profile` и `AuthProvider`

**Profile** — добавить кнопку:
```tsx
const triggerSync = useTriggerLibrarySync();
// ...
<Button
  title={triggerSync.isPending ? 'Syncing…' : 'Sync library now'}
  variant="secondary"
  disabled={triggerSync.isPending}
  onPress={() => triggerSync.mutate()}
/>
```

**AuthProvider** — после установки сессии проверить когда был последний sync:
```ts
useEffect(() => {
  if (!session?.user.id) return;
  // fire-and-forget: если БД говорит >24ч или never — запускаем
  void maybeAutoSync(session.user.id);
}, [session?.user.id]);

async function maybeAutoSync(userId: string) {
  const { data } = await supabase
    .from('streaming_connections_safe')
    .select('last_synced_at')
    .eq('provider', 'spotify')
    .maybeSingle();
  const stale =
    !data?.last_synced_at ||
    Date.now() - new Date(data.last_synced_at).getTime() > 24 * 60 * 60 * 1000;
  if (stale) {
    void triggerLibrarySync().catch((e) => {
      if (__DEV__) console.warn('[auto-sync] failed', e);
    });
  }
}
```

> **Внимание:** `streaming_connections_safe` сейчас не содержит `last_synced_at` — view надо расширить. Поправить в той же миграции шага 1: добавить `last_synced_at` в select view.

---

### Шаг 10 — Триггер первого sync после регистрации

В `app/(auth)/sign-in.tsx` после успешной `syncSpotifyConnection`:
```ts
await syncSpotifyConnection(session);
// initial sync — не блокируем UI, юзер сразу попадёт в tabs, увидит банер
void triggerLibrarySync().catch((e) => {
  if (__DEV__) console.warn('[initial-sync] failed', e);
});
```

---

### Шаг 11 — End-to-end проверка

1. **Чистый юзер**: на тестовом Spotify-аккаунте с 20+ saved albums и 100+ saved tracks
2. Logout (если уже залогинен)
3. Sign in → OAuth → возврат → попадаешь в Home → **наверху банер** "Importing your library… 0 / ?"
4. Через 1–2 сек банер показывает реальные числа, прогресс растёт
5. Через 5–10 сек банер исчезает (status = completed)
6. Открыть Library → виден отсортированный список альбомов
7. Поиск по части названия артиста → фильтрация работает
8. Profile → tap "Sync library now" → банер появляется снова, processed_count обнуляется и заполняется
9. В Supabase Dashboard → `library_sync_status` для этого юзера = `completed`, `aggregated_albums_count` совпадает с количеством строк в `user_library` где `removed_at is null`
10. Кейс с удалением: в Spotify убрать какой-то альбом из библиотеки → tap "Sync now" → в БД у этого альбома `removed_at` заполнен, в UI он пропал
11. Кейс с saved tracks → альбом: проверить что альбом, у которого 5+ сохранённых треков но **нет** в saved albums, всё равно попал в `user_library` с `source.saved_album = false, saved_tracks_count = 5+`

---

## 3. Definition of Done

- [ ] Миграция `user_library_and_sync_status` применена, типы регенерированы
- [ ] Realtime publication включает `library_sync_status`
- [ ] Edge Function `sync-spotify-library` задеплоена и проходит smoke-тест
- [ ] `streaming_connections_safe` расширен полем `last_synced_at`
- [ ] `_shared/spotify.ts` содержит `getValidSpotifyToken` и `fetchAllSpotifyPaged` с retry на 401/429
- [ ] `_shared/library-aggregation.ts` — чистая функция, `TRACK_THRESHOLD` вынесен в константу
- [ ] `app/(tabs)/library.tsx` показывает отсортированный список с поиском
- [ ] `app/(tabs)/index.tsx` (Home) и Library рендерят `SyncBanner` когда sync активен
- [ ] Banner обновляется в реальном времени через Realtime
- [ ] Profile содержит кнопку "Sync library now"
- [ ] Автосинк при открытии приложения если `last_synced_at` старше 24ч
- [ ] Soft-delete работает: альбомы убранные из Spotify исчезают из UI
- [ ] Сценарий saved tracks → альбом: альбом с 4+ сохранёнными треками попадает в библиотеку
- [ ] `npm run lint` зелёный, `npx tsc --noEmit` зелёный
- [ ] E2E прогон 11 шагов из §2 шаг 11
- [ ] Коммит `feat(phase-3): spotify library import with background sync`
- [ ] Коммит `docs(phase-3): plan and verification doc`

---

## 4. Что НЕ делаем в фазе 3 (явный non-scope)

- **MusicBrainz enrichment** — в фазу 4
- **Карточка альбома** при тапе — в фазу 5
- **Сортировки** кроме "added desc" — позже
- **Фильтры по жанрам/декадам** — позже
- **Pagination** на клиенте (загружаем до 1000 строк сразу) — для типичной библиотеки хватает, оптимизация если упрёмся
- **Cron-автосинк** на сервере для всех юзеров — фаза 4 (там это нужно для алгоритма)
- **Webhooks от Spotify** — Spotify их не предоставляет, не наш case
- **Импорт followed artists** — на будущее, если понадобится для алгоритма
- **Импорт recently played** — Spotify даёт только последние 50, малополезно
- **Тесты `library-aggregation.ts`** — пишем когда настроим testing в фазе 4
- **Apple Music / другие стриминги** — фаза 9+

---

## 5. Риски фазы 3 и митигации

| Риск | Митигация |
|---|---|
| `EdgeRuntime.waitUntil` не доступен или работает иначе чем ожидается | Проверить в актуальных доках Supabase Functions перед написанием. Альтернатива: синхронно возвращать ответ только после завершения sync (для библиотек <1000 треков занимает 5–10 сек, приемлемо для loading screen) |
| Pagination Spotify даёт race condition если юзер изменил библиотеку посреди sync | Не критично для MVP — в худшем случае следующий sync исправит. Но важно: всегда `upsert` с `onConflict`, никогда `insert` |
| Реалтайм соединение не пробивается в Expo Go (firewall, websocket) | Fallback: `useQuery` с `refetchInterval: 2000` пока банер активен. Реализовать сразу как `if (subscribed) {} else {polling fallback}` |
| Юзер с огромной библиотекой (10K+ треков) | `not in (...)` упрётся в длину запроса. Использовать вариант с `synced_at = started_at` + `update where synced_at < started_at`. Указано в плане шаг 5 |
| Spotify 429 (rate limit) на пике sync | `fetchAllSpotifyPaged` ждёт `Retry-After` секунд и retry. Реализовано в шаге 3 |
| Token истёк посреди sync | `fetchAllSpotifyPaged` принимает `refreshToken` callback, который вызывается на 401 один раз. Реализовано |
| Сетевой обрыв во время sync | `status = 'failed'` в БД, банер показывает ошибку с кнопкой retry. Не теряем уже импортированные строки (`upsert` идемпотентен) |
| Realtime payload содержит `null` поля для UPDATE | Фильтр в шаге 6: `payload.new as SyncStatus` — поля могут быть `null` если так в строке. Это нормально |
| Аватарка/обложка с null `images[]` | Везде `?? null` и UI компонент `LibraryListItem` рендерит fallback (нота-плейсхолдер) |
| Юзер делает "Sync now" пока ещё идёт первый sync | Edge Function не дедуплицирует. Это норм: второй вызов перезапишет `library_sync_status` и стартанёт заново. Альтернатива: возвращать 409 если `status='syncing'` — реализовать если в бете будет проблема |

---

## 6. Что я (юзер) делаю руками заранее

1. Проверить что Realtime включён для проекта (он включён по умолчанию на Free)
2. Подготовить тестовый Spotify-аккаунт с разнообразной библиотекой:
   - 10+ saved albums
   - 100+ saved tracks (среди них желательно 4+ из одного альбома, которого нет в saved albums — для проверки агрегации)
3. Закоммитить состояние перед стартом фазы — если что-то сломается, легко откатиться

---

## 7. Точки обращения к Claude Code

Рекомендую разбить на **4 задачи**:

1. _"Фаза 3, задача 1: создай миграцию `user_library_and_sync_status` по plans/phase-3-library-import.md шаг 1. Также добавь `last_synced_at` в view `streaming_connections_safe` отдельной alter-view-командой в этой же миграции. Запушь миграцию, перегенерируй `types/database.ts`. Проверь lint и typecheck. Покажи diff и остановись."_

2. _"Фаза 3, задача 2: реализуй Edge Function `sync-spotify-library` со всеми helper'ами в `_shared/spotify.ts` и `_shared/library-aggregation.ts` по шагам 2–5. Перед написанием кода прочитай актуальные доки Supabase Functions про `EdgeRuntime.waitUntil` — убедись что API именно такой и не поменялся. Используй вариант soft-delete через `synced_at < started_at` для устойчивости к большим библиотекам. Покажи код, не деплой — я задеплою сам."_

3. _"Фаза 3, задача 3: реализуй клиентский слой по шагам 6–10 (hooks, SyncBanner, переписать Library screen, обновить Profile и AuthProvider, триггер initial sync в sign-in). Если Realtime не доступен в Expo Go — добавь fallback на polling с `refetchInterval: 2000`. Покажи изменения, не запускай — я протестирую на телефоне."_

4. _"Фаза 3, задача 4: после успешного e2e (я подтвержу) — закоммить двумя коммитами `feat(phase-3): spotify library import with background sync` и `docs(phase-3): plan`. Обнови `plans/master-plan.md` §5 фаза 3 со статусом."_

В каждой задаче — обязательно: **"перед кодом прочитай актуальные доки Supabase JS v2 и Functions"**. API Realtime и EdgeRuntime реально поменялся между minor-версиями, и AI часто пишет по устаревшим примерам.

---

## 8. Открытые вопросы (решаем по ходу)

- [ ] Threshold для saved tracks (сейчас 4) — поднять/опустить после первой беты, когда увидим распределение
- [ ] Делать ли `triggerLibrarySync` дедуплицированным (отказывать если `status='syncing'`)? Решаем после первой беты
- [ ] Показывать ли в UI разбивку источника (`saved_album` vs `saved_tracks`)? Решаем в фазе 5 при дизайне карточки

---

## 9. Ориентировочный тайминг

| Шаг | Время |
|---|---|
| 1 (миграция + types) | 45 мин |
| 2 (Edge Function infra) | 15 мин |
| 3 (`_shared/spotify.ts` расширение) | 1 ч |
| 4 (`library-aggregation.ts`) | 30 мин |
| 5 (`sync-spotify-library/index.ts`) | 2 ч |
| 6 (клиентские hooks) | 1.5 ч |
| 7 (SyncBanner + ProgressBar) | 45 мин |
| 8 (Library screen) | 1.5 ч |
| 9 (Profile + AuthProvider auto-sync) | 45 мин |
| 10 (initial sync trigger) | 15 мин |
| 11 (e2e + отладка) | 3 ч |
| **Буфер на Realtime/EdgeRuntime issues** | +50% |

**Итого:** 18–22 часов чистого времени. Растягиваем на 1.5–2 недели по 1.5 ч в день.

**Чем сложнее фазы 1–2:** background-выполнение в Edge Function + Realtime + soft-delete reconciliation — три новых для проекта механизма одновременно. Поэтому задач 4, не 3.

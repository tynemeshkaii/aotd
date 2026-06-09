# Album of the Day — Генеральный мастер-план

> Документ, на который мы опираемся на протяжении всей разработки. Обновляется по ходу — в конце каждой фазы фиксируем что изменилось.

**Последнее обновление:** 2026-05-25
**Статус:** Фазы 1–3 выполнены. В работе: фаза 4 (алгоритм). Социальный слой вырезан из v1, перенесён в [v2-social.md](./v2-social.md). Концепция-refinement pass завершён 2026-05-25: упрощены табы (3 вместо 4), убран skip, упрощены ratings (5 эмоциональных уровней), ratings стали personal journal (не кормят алгоритм), убран genre ranking из алгоритма. Pre-launch чеклист в [v1-risks.md](./v1-risks.md).

---

## 0. Базовые решения (зафиксированы)

| Параметр | Решение | Почему |
|---|---|---|
| Платформа MVP | iOS only | Один разработчик, Expo даёт быстрый цикл, Android добавим после product-market fit |
| Технология | Expo + React Native + TypeScript | Без Xcode, тестирование на телефоне через Expo Go, сборка через EAS |
| Бэкенд | Supabase (Postgres + Auth + Edge Functions) | Всё в одном, веб-интерфейс к БД, бесплатно до ~500 пользователей |
| Стриминги MVP | Spotify | Лучший API из всех, OAuth, нужный объём данных |
| Стриминги позже | Apple Music → YouTube Music → Я.Музыка/VK | По убыванию качества API и легальности |
| Источники рейтингов MVP | Last.fm API + MusicBrainz | Бесплатные легальные API; покрывают рейтинги (через скроббла) и метаданные |
| Источники рейтингов позже | Discogs API (легально), AOTY/RYM (через research) | Обогащение для diff-преимущества |
| Курация | Персональный альбом дня для каждого юзера | Сильнее retention, чем общий |
| Социальный слой | **Вырезан из v1, перенесён в v2** (2026-05-25) | Cold-start: social features требуют critical mass юзеров; до этого выглядят сломанными. V1 — solo-first. Backlog: [v2-social.md](./v2-social.md) |
| V1 audience | **English-speaking only** | Англоязычная аудитория — primary рынок iOS music apps. Локализация (RU и др.) — после v1 launch. UI копи полностью на EN |
| Share intent на карточке альбома | **В scope v1** (фаза 5) | OS Share Sheet через `expo-sharing` + сгенерированная картинка через `react-native-view-shot`. Не социалка, organic-growth канал |
| Stats / taste profile | **Часть Profile screen, не отдельный таб** (2026-05-25) | Stats — это и есть профиль ("кто ты как слушатель"). Лучше один богатый экран чем два полу-пустых таба. 3 таба = Home / Discoveries / Profile |
| Skip mechanic | **Не существует** | Tinder-style swipe противоречит "low pressure" философии. Если юзер не открыл/не рейтнул — альбом остаётся в Discoveries как `pending`. Никаких UI кнопок skip |
| Rating UX | **5 эмоциональных уровней** (`Loved it / Liked it / It was alright / Not for me / Bad`) | Числовые шкалы заставляют юзера придумывать свою систему оценок. Эмоциональные ярлыки — нулевой когнитивный барьер. Внутри маппится в 5/4/3/2/1 |
| Что кормит алгоритм | **Только `user_library` + `recommendation_history`** | Ratings — это personal journal юзера, **не** алгоритмический сигнал. Это снимает давление рейтить, делает алгоритм предсказуемым (library меняется → recs меняются), убирает filter-bubble drift |
| Genre ranking в алгоритме | **Не используется** | Жанровая таксономия в музыке broken (особенно в андерграунде — dungeon synth, deconstructed club, ebm). Алгоритм работает на artist-similarity + audio features, минуя жанры |
| Spotify Free / Premium detection | **Обязательно** | `/me.product` парсим при OAuth, сохраняем в `streaming_connections.spotify_product`. Для Free показываем мягкий explainer один раз. Не блокер |
| "Why this album?" UI блок | **Обязательно на карточке** | Без объяснения юзер не доверяет алгоритму. Tone — humor + low pressure: "Based on your library. We hope you like it. If not — tomorrow's pick is on us." |
| Монетизация | Решение отложено | Архитектура не предполагает paywall на старте, но БД готова к нему |
| Валидация | TestFlight closed beta → public TestFlight → App Store | Минимум 4 недели на beta-фидбек |

---

## 1. Продуктовая стратегия

### 1.1. Проблема, которую решаем

- Алгоритмы Spotify/Apple крутят то, что уже слушал. Open discovery в стримингах деградировал.
- Тренд на album-listening (vinyl revival, "анти-плейлист" разговоры). Аудитория уже сегментирована и ищет инструменты для этого.
- Аналог "Слово дня"/"Цитата дня" формата для музыки — пустая ниша в App Store (проверить на этапе research, см. §1.4).

### 1.2. Целевая аудитория

**Primary persona — "Музыкальный гурман"** (24–40 лет):
- слушает 5+ часов музыки в неделю
- знает что такое RateYourMusic / AOTY / Pitchfork
- уже разочарован в алгоритмах своего стриминга
- готов выделять время на целый альбом, а не на отдельные треки
- скорее всего, на Spotify (доля гурманов выше, чем в Apple Music)

**Secondary persona — "Возвращающийся слушатель"**:
- слушал альбомы в 2010-х, перешёл на плейлисты, скучает по формату
- меньше про reviews, больше про nostalgia + новизну

### 1.3. Core loop (что юзер делает каждый день)

```
Утром получает push: "Альбом дня готов"
→ Открывает приложение → видит карточку альбома
→ Читает инфу (артист, год, жанр, рейтинг)
→ Тапает "Open in Spotify" → слушает
→ Возвращается в приложение → ставит оценку 1–10
→ (optional) Пишет короткую заметку
→ На следующий день — новый альбом
```

**Метрика успеха core loop:** DAU/MAU > 30%, retention day-7 > 25%.

### 1.4. Competitive research (TODO в Фазе 0)

Найти и проанализировать перед стартом разработки:
- Album of the Day apps в App Store (поиск по "album day", "daily album")
- Discoverify-подобные сервисы
- Подкасты типа "Discograffiti" — что фанаты альбомов уже потребляют
- Telegram-каналы "Альбом дня" — уже существуют, есть аудитория = валидация спроса

**Ожидаемые конкуренты:** AlbumOfTheYear (web), Album.fm (если ещё жив), различные curated newsletter'ы. Прямого мобильного app с интеграцией библиотеки скорее всего нет — это и есть differentiation.

### 1.5. Уникальное ценностное предложение (UVP)

> "Каждый день — один альбом, которого нет в твоей библиотеке, подобранный под твой вкус. Не плейлист, не радио — целое произведение, как задумал артист."

**Differentiators v1:**
1. Интеграция с библиотекой стриминга (исключает то, что уже слушал)
2. Один альбом — не паралич выбора
3. Полный альбом, не сингл/трек
4. Качество алгоритма (Last.fm + MusicBrainz + персонализация по библиотеке)
5. Современный, ламповый, отзывчивый дизайн — выделяемся среди утилитарных music apps

**Differentiators v2 (после product-market fit):**
- Социальный слой: friends, activity feed, shared discoveries
- Дополнительные стриминги (Apple Music)
- Подробности — в [v2-social.md](./v2-social.md)

---

## 2. Архитектурный обзор

### 2.1. Системная диаграмма (logical)

```
┌─────────────────┐
│  iOS App        │  Expo + RN + TypeScript
│  (Expo Go/EAS)  │  expo-auth-session, expo-notifications
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────────────┐
│  Supabase                               │
│  ├── Auth (Spotify OAuth provider)      │
│  ├── Postgres (см. §3 schema)           │
│  ├── Row Level Security                 │
│  └── Edge Functions (Deno/TypeScript)   │
│      ├── sync-spotify-library           │
│      ├── compute-album-of-the-day       │
│      ├── refresh-spotify-token          │
│      └── send-daily-push                │
└────────┬────────────────────────────────┘
         │
         ├──────────────┬───────────────┬──────────────┐
         ▼              ▼               ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Spotify API  │ │ Last.fm API  │ │ MusicBrainz  │ │ Discogs (v2) │
│ (OAuth user) │ │ (genres/top) │ │ (metadata)   │ │ (legal)      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### 2.2. Ключевые архитектурные принципы

1. **Тонкий клиент.** Вся бизнес-логика (алгоритм рекомендации, агрегация рейтингов, refresh токенов) — в Edge Functions. Клиент только рендерит и собирает события.
2. **Кэш сторонних API.** Last.fm/MusicBrainz/Discogs ответы кэшируются в Postgres (таблица `external_album_cache`). Это и rate-limit, и скорость, и юридическая защита (не дёргаем чужие API на каждый запрос).
3. **Идемпотентность.** Все джобы (синхронизация, рекомендация) должны быть переидемпотентны. Если функция выполнилась дважды — состояние не сломается.
4. **Расширяемость по стримингам.** Слой `StreamingProvider` в БД и коде: добавление Apple Music = новый провайдер, не переделка всей логики.
5. **Privacy-first.** Spotify access_token хранится зашифрованным (Supabase Vault). RLS не даёт юзеру читать чужие данные.

### 2.3. Стек зависимостей

**Mobile:**
- `expo` (SDK 52+)
- `expo-router` (file-based routing)
- `expo-auth-session` (Spotify OAuth)
- `expo-secure-store` (локальные секреты)
- `expo-notifications` (push)
- `@supabase/supabase-js`
- `@tanstack/react-query` (server state)
- `react-native-reanimated` (анимации карточки)
- `nativewind` или `tamagui` — определяем в Фазе 1

**Backend:**
- Supabase Edge Functions (Deno runtime)
- `pg_cron` — для ежедневных задач
- `pg_net` — для HTTP-вызовов из БД (опционально)

**Внешние:**
- Sentry — error tracking. **Отложено до фазы 5–6** (см. §5, фаза 6). В фазе 1 заведён только stub `lib/sentry.ts` без установленного `@sentry/react-native` — подключим перед closed beta, когда появятся реальные пользователи и ошибки, которые имеет смысл ловить.
- PostHog или Amplitude — аналитика (с фазы 5)
- RevenueCat — на будущее, для подписки (структура учитывается, но не интегрируется)

---

## 3. Схема базы данных (расширенная)

```sql
-- Пользователи
users
├── id (uuid, PK)
├── created_at
├── display_name
├── avatar_url
├── email (nullable)
├── timezone (для push в нужное время)
├── preferred_push_time (default '08:00')
└── onboarding_completed (bool)

-- Подключённые стриминговые сервисы
streaming_connections
├── id (uuid, PK)
├── user_id → users.id
├── provider ('spotify' | 'apple_music' | ...)
├── provider_user_id
├── access_token (encrypted via Supabase Vault)
├── refresh_token (encrypted)
├── token_expires_at
├── scopes
├── spotify_product ('premium' | 'free' | null)  -- из /me.product, для Free explainer
├── connected_at
└── last_synced_at

-- Библиотека пользователя (всё что у него уже есть)
user_library
├── id
├── user_id
├── provider
├── provider_album_id (spotify_album_id и т.д.)
├── mb_release_group_id (musicbrainz id, для дедупликации)
├── album_name
├── artist_name
├── added_at_provider (когда добавил в стриминг)
└── synced_at

-- Универсальный кэш альбомов (метаданные из всех источников)
albums
├── id (uuid, PK)
├── mb_release_group_id (unique, основной ID)
├── title
├── primary_artist
├── release_year
├── genres (jsonb)
├── cover_url
├── lastfm_listeners
├── lastfm_playcount
├── discogs_rating
├── discogs_rating_count
├── aoty_score (nullable, заполняется позже)
├── rym_score (nullable, заполняется позже)
├── spotify_id (для deep link)
├── apple_music_id (nullable)
├── metadata_updated_at
└── popularity_score (computed, см. алгоритм)

-- Альбомы дня (история рекомендаций)
albums_of_the_day
├── id
├── user_id
├── date (date, unique per user)
├── album_id → albums.id
├── algorithm_version (для A/B)
├── selection_reason (jsonb: какие артисты из библиотеки повлияли — НЕ жанры)
├── status ('pending' | 'opened' | 'rated')  -- НЕТ 'skipped', НЕТ 'listened'
├── opened_at
└── created_at

-- Оценки (personal journal, НЕ алгоритмический сигнал)
ratings
├── id
├── user_id
├── album_id → albums.id
├── album_of_the_day_id (nullable — можно оценить альбом не из рекомендации)
├── score (1–5, internal mapping: 5=Loved / 4=Liked / 3=Alright / 2=Not for me / 1=Bad)
├── comment (text, nullable)
├── is_public (для v2 соцфич, default false; в v1 UI всегда оставляет false)
├── created_at
└── updated_at
-- Важно: алгоритм НЕ читает эту таблицу. Только library + recommendation_history.

-- Анти-дубликаты: что уже рекомендовали
recommendation_history
├── id
├── user_id
├── album_id
└── recommended_at
(индекс на user_id + album_id)

-- Для v2 (НЕ создаём в v1, но user_id/timestamps в существующих таблицах
-- спроектированы так, чтобы социалка прикрутилась без миграции данных):
-- friendships(id, requester_id, addressee_id, status, created_at)
-- activity_feed(id, user_id, type, payload jsonb, created_at)
-- ratings.is_public — уже заложен в схему как future-proof, но в v1 всегда false
```

> **Note:** колонка `ratings.is_public` остаётся в схеме как future-proof, но в v1 UI её не выставляет — все рейтинги приватны. Это корректно с точки зрения privacy (когда v2 включит социалку, юзер должен явно opt-in каждой оценки или включить настройку, а не получить ретроактивный публичный feed).

### 3.1. Критические RLS-политики

- `streaming_connections`: SELECT/UPDATE только `auth.uid() = user_id`
- `user_library`: то же
- `ratings`: SELECT — owner only в v1 (`auth.uid() = user_id`). V2 расширит до `owner OR (is_public AND friend)`.
- `albums`: SELECT для всех аутентифицированных (общий кэш)

---

## 4. Алгоритм рекомендации (детально)

### 4.1. Версия 1 — MVP (фаза 4)

**Вход:** `user_id`, текущая дата.
**Выход:** один `album_id`, который становится "альбомом дня".

**Принципы (зафиксированы 2026-05-25):**

- **Алгоритм читает только `user_library` + `recommendation_history`**. НЕ читает `ratings`. Это намеренно: ratings — это personal journal юзера, не алгоритмический сигнал. Меняется library (юзер сохранил что-то в Spotify) → меняются recommendations. Простая, предсказуемая causality.
- **Никакого ranking по жанрам.** Жанровая таксономия в музыке шумная и broken (особенно для underground). Работаем на уровне артистов и audio-features.
- **Day-1 quality = Day-N quality.** Алгоритм не требует исторических данных юзера в нашей БД — всё что нужно есть в первый день из импортированной библиотеки.

**Pipeline:**

```
1. EXTRACT TASTE SIGNAL:
   - Из user_library взять активные альбомы (removed_at is null)
   - Top-50 артистов по частоте (counted by appearance in user_library)
   - Для каждого top-артиста — получить per-track audio features
     топ-5 наиболее представленных треков (Spotify /audio-features)
   - Усреднить audio features → "taste vector":
     {energy, valence, danceability, acousticness, instrumentalness, tempo}
   - Это снимок vibe юзера, не зависящий от жанровых ярлыков

2. CANDIDATE GENERATION (target: 200–400 кандидатов):
   - Для top-20 артистов из библиотеки:
     - Spotify /artists/{id}/related-artists → ~20 артистов
     - Last.fm artist.getSimilar → ~30 артистов
     - Дедуп, объединение
   - Для каждого related-артиста: его top albums (Spotify /artists/{id}/albums, тип = album)
   - Это даёт candidate pool альбомов соседних артистов БЕЗ обращения к жанрам

3. FILTERING:
   - Исключить альбомы где primary artist уже в user_library (мы рекомендуем НОВОЕ)
   - Исключить mb_release_group_id из user_library (если уже знаем MB id)
   - Исключить всё что в recommendation_history за 365 дней (включая ранее rated 'Bad' — они тут автоматически)
   - Исключить < 6 треков (singles/EPs) и < 20 минут общей длительности
   - Исключить compilations/live/soundtrack (через MusicBrainz release-group type, lazy lookup)

4. SCORING:
   score = (
     0.35 * artist_similarity_score      -- насколько артист близок к топ-юзера (Last.fm similarity weight)
     + 0.30 * audio_feature_match        -- 1 - normalized_distance(album_features, taste_vector)
     + 0.20 * normalized(lastfm_listeners) -- soft popularity prior (защита от шлака)
     + 0.05 * recency_bonus              -- релизы последних 5 лет +small boost (опционально)
     + 0.10 * random_factor              -- variety, anti-determinism
   )

   Важно: lastfm_listeners normalize-им ВНУТРИ кандидат-пула, не глобально.
   Это даёт фейр chance underground альбомам если они в pool — мы не давим их
   глобальной популярностью топ-50 артистов планеты.

5. SELECTION:
   - Top-20 по score
   - Weighted random выбор из top-20 (probability ∝ score) — даёт разнообразие
   - Записать в albums_of_the_day с selection_reason

6. selection_reason jsonb:
   {
     "primary_artist_in_library": "Boards of Canada",  -- top-1 артист который повлиял
     "similar_to": ["Aphex Twin", "Autechre"],         -- 2-3 related артиста в pool
     "audio_match": "ambient + low energy + instrumental", -- human readable из features
     "lastfm_listeners": 124000
   }
   UI парсит и показывает плейн-фразой типа:
   "Picked because you've been saving stuff by Boards of Canada and similar artists. We hope you like it."

7. SMALL LIBRARY FALLBACK:
   - Если top-50 artists юзера < 10 уникальных, или audio_features extraction
     дал < 30 треков:
     - Fallback на Last.fm globally-top albums последних 50 лет,
       взвешенных через recency_bonus
     - Soft-match по audio features тех немногих треков что есть
     - selection_reason: "Just exploring — your library will shape what we pick next"

8. TIMEZONE-AWARE COMPUTE:
   - НЕ один cron в 00:00 UTC для всех
   - Cron каждый час запускает compute для юзеров,
     у которых preferred_push_time через ~1 час по их timezone
   - Это держит окно compute → push ≤ 2 часа (токен свежий, кэш актуален)

9. MB ENRICHMENT — cache-first, non-blocking:
   - При scoring/filtering MB lookup идёт через external_album_cache
   - На cache miss НЕ блокируем — возвращаем альбом без mb_release_group_id
   - Фоновый pre-warm job (фаза 6+) еженощно подсасывает топ Last.fm в cache
```

### 4.2. Версии 2+ (после фидбека)

- Variety controls: не рекомендовать 3 ambient альбома подряд
- Mood/season hints (опционально, юзер может выбрать "today I want something energetic")
- Discogs scores как дополнительный сигнал
- **(не v1)** Учёт ratings как soft signal — открытый вопрос, потребует A/B и явного product решения. По умолчанию ratings остаются personal journal.
- **(v2-only)** Учёт оценок друзей — социальный сигнал
- **(v3+)** Collaborative filtering ("юзеры с похожей библиотекой также любят X") — когда наберётся база

### 4.3. Юридические нюансы источников рейтингов

| Источник | API | Юридический статус | Решение |
|---|---|---|---|
| Last.fm | Officical API key, бесплатно | Зелёный | Используем с MVP |
| MusicBrainz | Open API, требует User-Agent | Зелёный | Используем с MVP, обязательный rate limit 1 req/s |
| Discogs | Official API, OAuth для extended | Зелёный (для read) | Добавить в фазе 4 как доп. сигнал |
| RateYourMusic | API нет, ToS запрещает скрейпинг | **Красный** | Не интегрируем напрямую. Возможно — пользовательский import (юзер сам экспортирует свой профиль) |
| AOTY | API нет, скрейпинг в серой зоне | **Жёлтый** | Не на MVP. Возможно — partnership |

**Важно:** скрейпинг RYM почти гарантированно приведёт к жалобе и удалению из App Store. **Не делаем.**

---

## 5. Обновлённый план по фазам

> Главные отличия от исходного `album-of-the-day-plan.md`: разнесена валидация, добавлены legal/research-шаги, добавлены аналитика и observability. **2026-05-25 — социальный слой полностью вырезан из v1**, перенесён в [v2-social.md](./v2-social.md). Освободившееся время идёт в качество алгоритма, дизайн и polish.

### Фаза 0 — Подготовка и validation (1 неделя)

**Что делаем:**
- Создать все аккаунты (Spotify Developer, Supabase, Last.fm, Expo, Sentry)
- Установить toolchain (Node LTS, Expo CLI, Expo Go на iPhone, Supabase CLI)
- **Competitive research:** найти 5–10 похожих приложений/сервисов, выписать что они делают
- **User research:** опросить 5–10 знакомых меломанов: "пользовались бы?" → выписать что они говорят
- Создать Notion/Linear для трекинга задач
- Завести git-репозиторий, добавить README

**Выход:** список аккаунтов, заметки по конкурентам, валидация со стороны 5+ пользователей.

### Фаза 1 — Скелет приложения (1 неделя)

- Expo project + expo-router + TypeScript
- Структура папок: `app/` (роуты), `components/`, `lib/` (api, supabase client), `types/`
- 4 базовых экрана-заглушки: Home, Library, Friends, Profile _(исторически; финальная структура v1 — Home / Discoveries / Stats / Profile после двух pivot'ов)_
- Supabase подключён, базовая схема (см. §3) создана через миграции
- Sentry — **только stub** `lib/sentry.ts`, без установки `@sentry/react-native`. Полная интеграция перенесена в фазу 6 (перед closed beta)
- Запускается через Expo Go на личном iPhone

**Точка проверки:** на телефоне открывается, переключается между экранами.

**Статус:** ✅ Выполнено (2026-05-23). Детали в [phase-1-skeleton.md](./phase-1-skeleton.md). Известные отложенные пункты: полная интеграция Sentry → фаза 6; генерация `types/database.ts` через `supabase gen types` после `supabase login` (сейчас hand-written placeholder).

### Фаза 2 — Spotify Auth + базовый профиль (1–2 недели)

- expo-auth-session + Spotify OAuth (Authorization Code with PKCE)
- Edge Function `refresh-spotify-token` (cron каждый час для активных юзеров)
- Профиль создаётся при первом логине (display_name, avatar из Spotify)
- Экран Profile показывает: имя, аватар, "connected to Spotify"
- Logout

**Точка проверки:** logout/login работает, токен обновляется автоматически.

**Статус:** ✅ Выполнено (2026-05-23). Детали в [phase-2-spotify-auth.md](./phase-2-spotify-auth.md) и [phase-2-session-verification.md](./phase-2-session-verification.md).

### Фаза 3 — Импорт библиотеки (1–2 недели)

- Edge Function `sync-spotify-library` импортирует Saved Albums + Saved Tracks
- Агрегация через `TRACK_THRESHOLD = 4`
- Background-выполнение через `EdgeRuntime.waitUntil`, прогресс через Realtime
- **Discoveries pivot:** UI-вкладки Library нет — данные используются только алгоритмом
  и видны в Profile как статус
- Initial sync блокирует доступ к табам full-screen splash'ем
- Кнопка "Sync" в Profile
- Автосинк раз в 24ч в фоне (без UI)

**Точка проверки:** библиотека юзера полностью в приложении.

**Статус:** ✅ Выполнено (2026-05-24). Детали в [phase-3-library-import.md](./phase-3-library-import.md) и [discoveries-pivot.md](./discoveries-pivot.md). Финальный e2e-тест на боевом аккаунте автора (10k+ треков) проводится отдельно — стратегия описана в [phase-3-library-import.md §6a](./phase-3-library-import.md).

### Фаза 4 — Алгоритм "Альбом дня" (3 недели)

- Edge Function `compute-album-of-the-day` (см. §4.1)
- pg_cron: каждый день в 00:00 UTC для всех активных юзеров (учитываем timezone)
- Last.fm клиент в Edge (с rate limit + кэш)
- MusicBrainz клиент в Edge (1 req/s, обязательный User-Agent)
- Кэш в `albums` и `external_album_cache`
- Экран Home показывает текущий "альбом дня"
- Экран History показывает прошлые рекомендации
- **Ручной trigger** "Get my album" для тестирования

**Точка проверки:** каждое утро на телефоне новый альбом, подобранный осмысленно (не рандом).

### Фаза 5 — Карточка альбома, ratings, Discoveries полностью, share (2–2.5 недели)

- **Home screen финальный:**
  - Большая карточка сегодняшнего AOTD
  - "Why this album" блок с парсингом `selection_reason` (humor + low-pressure tone)
  - Deep link `spotify:album:xxx` (или web-fallback https://open.spotify.com/album/xxx)
  - Spotify product badge: для Free юзеров — мягкий explainer "Free Spotify may shuffle — Premium plays the album in order"
  - Длительность альбома и число треков (для listening-context)
  - "Unrated discoveries" hint снизу если есть pending альбомы за прошлые дни
- **Discoveries screen полноценный:**
  - Список всех past `albums_of_the_day` desc by date
  - Status badges: 🆕 New / 👂 Opened / ✓ Loved / ✓ Liked / · Alright / ✕ Not for me / ✕ Bad / ⏳ Pending
  - Tap → переход на карточку альбома (re-use Home card layout)
  - Поиск/фильтр по статусу опционально (или v2)
- **Rating UI:**
  - 5 emotional levels: `Loved it / Liked it / It was alright / Not for me / Bad`
  - Plain word labels, без эмодзи как primary visual
  - Map к 1–5 в БД (`ratings.score`)
  - Опциональный комментарий (textarea, приватный, для journal)
  - Первый раз когда юзер рейтит — toast/microcopy: *"Saved to your journal. Your library shapes tomorrow's pick, not your ratings — keep saving in Spotify."*
- **Статусы:** `pending → opened → rated`. Нет `skipped`, нет `listened`. Юзер может рейтить с любой стадии.
- **Share intent:**
  - Кнопка Share на карточке альбома
  - Генерируем картинку через `react-native-view-shot` — крупная обложка + artist/album + subtle "via [App]"
  - Текст: `"My album of the day: [Artist] — [Album] 🎧 [spotify_link]"`
  - Native iOS Share Sheet через `expo-sharing.shareAsync()`
- **Push timing handling в БД:** добавляется `albums_of_the_day.user_timezone_at_compute`, чтобы дебажить timezone-issues

**Точка проверки:** полный core loop работает end-to-end. Share работает в iMessage / Telegram / Instagram Stories.

### Фаза 6 — Design system + rich Profile + polish (2.5–3 недели)

> Цель — превратить "функционально работающий" продукт в "приятно держать в руках". Сюда же перенеслось содержимое отменённого Stats tab — теперь это секции внутри Profile.

- **Design system pass:**
  - Ревизия всех экранов: spacing, typography, color tokens
  - **Собственная цветовая идентичность** — НЕ Spotify-green. Тёплая, "album-cover-y" палитра: deep burgundy / kremовый / accent gold (финальный выбор в этой фазе). Заменить `#1db954` в tab bar и других hardcoded местах.
  - Tone of voice фиксируется: humor + low pressure + "we respect your taste" во всех microcopy
- **Анимации и микроинтеракции:**
  - Reanimated parallax обложки на карточке альбома
  - Тактильные отклики на rating (haptic feedback)
  - Плавные transitions между экранами
  - Loading skeletons вместо ActivityIndicator
- **Profile screen — богатое содержимое (бывший Stats tab merged):**
  - Hero card: аватар + display_name + streak ("12-day streak · 47 albums discovered")
  - **Your taste** section: top artists (из library), library composition по декадам, "your library spans 1968–2024"
  - **Listening summary**: rated this month, "loved" count, avg score, link to filtered Discoveries
  - **Library status**: X albums tracked · synced 2h ago + manual sync button
  - **Connections**: ✓ Spotify connected as {display_name} (+ product badge Free/Premium), disconnect
  - **Settings**: push time, delete account (фаза 7), sign out
  - Day-1 Profile НЕ пустой: используем library composition сразу после import (top artists / decades / count), не ждём накопления ratings
- **Empty states и error states** дизайнятся специально, а не падают на placeholder
- Иконка приложения + splash screen финального качества
- **MusicBrainz nightly pre-warm cron**: подсасывает топ Last.fm альбомы в `external_album_cache`, чтобы реальные user-driven lookup'ы шли с cache hit

**Точка проверки:** на телефоне приложение выглядит и ощущается как продукт, не demo.

### Фаза 7 — Notifications, error handling, GDPR, onboarding, beta (3 недели)

> Самая объёмная фаза — собираем production-ready приложение и запускаемся в TestFlight.

- **Push-уведомления (expo-notifications + APNs):**
  - Утром: "Your album of the day is ready" с учётом `users.timezone` и `preferred_push_time`
  - НЕТ push'a "не забудь оценить вчерашний" (давление, не наш вайб)
  - Permission ask: НЕ на app launch. Сначала explainer экран в onboarding ("чтобы каждое утро присылать тебе альбом — разрешишь?") → потом нативный prompt
- **Минимальный onboarding (без taste declarations):**
  - Шаг 1: "Album of the Day — one album, every day, picked from your taste"
  - Шаг 2: Connect Spotify (OAuth)
  - Шаг 3: Push permission explainer + ask
  - Шаг 4: Done — пока импортируется library, показываем "we're learning your taste, won't take long"
  - НЕТ taste-seeding, genre selection, mood pickers — library уже есть, она достаточна
- **Error handling end-to-end:**
  - Spotify connection broken (refresh token invalid) — экран "Reconnect Spotify" не ломает доступ к Discoveries history, auto-sync блокируется с exponential backoff
  - Нет интернета — offline state с cached последним AOTD и Discoveries
  - Алгоритм не нашёл кандидатов (extreme small library) — fallback message + "explore by yourself" с парой curated классических альбомов
- **GDPR / Apple compliance:**
  - Delete account flow в Profile → Settings (confirmation → cascade delete + revoke Spotify token через POST `accounts.spotify.com/api/token/revoke`)
  - Data export (опционально, JSON download всех ratings + AOTD history)
  - Privacy policy (web-hosted)
- **Sentry: полная интеграция** (`@sentry/react-native`, source maps, тестовый event, замена stub `lib/sentry.ts` рабочим init). Перенесено из фазы 1.
- **PostHog/Amplitude:** ключевые события (signup, library_synced, album_opened, rated, shared, retention cohorts)
- **Spotify Extended Quota application** — подаём в начале этой фазы, потому что Spotify ревьюит **вручную и долго (3–6 недель)**. Это **блокер** для публичного релиза — без approval мы заперты на 25 whitelisted юзеров. Заранее изучить [Spotify Design Guidelines](https://developer.spotify.com/documentation/design): обязательный "Powered by Spotify" footer, конкретный wording "Open in Spotify", запрет деривативных streaming фич.
- **TestFlight closed beta** (10–25 знакомых меломанов в whitelist Spotify Dev Mode)
- Сбор фидбека 2 недели в Notion
- Итерация по тому что больно

**Точка проверки:** 10+ людей пользовались неделю, есть фидбек, Spotify Extended Quota — в процессе review.

### Фаза 8 — App Store release v1 (1.5–2 недели)

- **App name финальный выбор** (не "Album of the Day" — generic, SEO мёртвый). Brainstorm + проверка в App Store search до submission. Brandable, 1–2 слова.
- App Store screenshots (через Figma/Apple presets)
- Описание, ключевые слова, категория (Music)
- **Privacy nutrition labels детально** (см. чеклист в [v1-risks.md](./v1-risks.md)):
  - Spotify access/refresh tokens (Sensitive Info — почему храним, как защищаем)
  - Library data (User Content — collected, not shared, used for app functionality)
  - Ratings (User Content)
  - Push token (Identifiers)
  - Sentry diagnostics (Diagnostics — crash logs only, no PII)
  - PostHog/Amplitude usage (Usage Data)
- **Spotify branding compliance check** — все обязательные элементы по Spotify Design Guidelines на месте ("Powered by Spotify", "Open in Spotify" wording, logo usage)
- **Spotify Extended Quota approved** — БЛОКЕР, без этого не запускаемся в open beta / production
- Apple Developer Program ($99)
- EAS build production
- Submit + iterate если reject
- Soft launch — English-speaking markets only (US / UK / CA / AU)
- Pre-launch чеклист: [v1-risks.md](./v1-risks.md)

### Фаза 9+ / v2 — Постлонч и социальный слой (бесконечно)

**V2 — социальный слой** (отдельный major release после product-market fit v1).
Полный backlog: [v2-social.md](./v2-social.md). Кратко:
- Поиск пользователей, friend requests
- Activity feed: что друзья оценивали
- Privacy controls на оценках (private / friends / public)
- Социальный сигнал в алгоритме рекомендаций
- Profile-by-username, реакции, треды

**Прочие постлонч-фичи (параллельно с v2 или после):**
- Apple Music (MusicKit интеграция) — большой проект сам по себе
- YouTube Music через workaround
- Веб-версия / landing с импортом профиля
- Подписка с RevenueCat (если retention оправдает)
- Дополнительные источники рейтингов (Discogs, AOTY partnership)
- AI-features: "почему именно этот альбом" объяснение через LLM

---

## 6. Таймлайн (с буфером)

| Период | Фаза | Деливерабл | Статус |
|---|---|---|---|
| Неделя 1 | 0 | Среда + research | ✅ |
| Неделя 2 | 1 | Скелет | ✅ |
| Неделя 3–4 | 2 | Auth | ✅ |
| Неделя 5–6 | 3 | Импорт + Discoveries pivot | ✅ |
| Неделя 7–9 | 4 | Алгоритм (artist-similarity + audio-features) | в работе |
| Неделя 10–12 | 5 | Карточка альбома + ratings + Discoveries + share | — |
| Неделя 13–15 | 6 | Design system + rich Profile + polish | — |
| Неделя 16–18 | 7 | Notifications + GDPR + onboarding + closed beta + Spotify Quota submission | — |
| Неделя 19–22 | (буфер: Spotify Quota review 3–6 недель + фидбек итерации) | — | — |
| Неделя 23–24 | 8 | App Store release v1 | — |

**Реалистичная оценка v1: 5.5–6 месяцев** до публичного релиза при работе 10–15 ч/неделю.

Главный источник timeline-неопределённости — **Spotify Extended Quota review** (3–6 недель ручного review без гарантии approval). Подаём заявку как можно раньше в фазе 7, параллельно с beta.

Социальный слой (v2) — отдельный major release после product-market fit.

---

## 7. Риски и митигации

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| **Spotify Extended Quota** отклонят или сильно задержат | Средняя | **Очень высокое** | Подаём в фазе 7 (за 6+ недель до планируемого релиза). Скрупулёзно соблюдаем Design Guidelines (Powered by Spotify, Open in Spotify wording, logo). Имя приложения не должно копировать Spotify визуально/нейминг |
| Spotify ужесточит API (как было в 2024) | Средняя | Высокое | Архитектура с провайдерами, не зависим только от Spotify. Apple Music — следующая интеграция после v1 |
| Spotify Free юзер слышит шафл вместо альбома | Высокая (у Free юзеров) | Среднее | Detection через `/me.product` + мягкий explainer один раз. Не блокер, документируем как known limitation |
| Refresh token истёк / юзер отозвал доступ → app мёртв | Средняя | Высокое | Graceful "Reconnect Spotify" flow. Discoveries history остаётся доступной без активного Spotify. Auto-sync блокируется с exponential backoff |
| Apple отклонит app (за похожесть на Music, branding, privacy labels) | Средняя | Среднее | Privacy labels проработаны заранее, branding проверен на Spotify Guidelines и Apple HIG. Не позиционируем как замену Music |
| Алгоритм даёт скучные/попсовые рекомендации | Высокая | Очень высокое | Artist-similarity > genre ranking, normalize popularity **внутри** candidate pool (не глобально). Closed beta как валидация. Версионирование алгоритма для отката |
| Алгоритм скошен в западную мейнстримовую музыку | Средняя | Высокое | normalize_inside_pool + audio_feature_match убирают bias к топ-50 артистам глобально. Underground (dungeon synth, deconstructed club) обрабатывается через artist-similarity автоматически |
| Low retention (юзер не возвращается каждый день) | Высокая | Очень высокое | Push без давления, streak в Profile, "Discoveries как backlog" вместо guilt-loop, качество алгоритма как главный retention-драйвер v1 |
| "Не успел дослушать вчерашний" guilt-loop | Высокая | Высокое | Discoveries показывает все past AOTD с pending-статусом, юзер сам возвращается; "unrated discoveries" hint на Home; push утром не упоминает прошлое |
| Имя "Album of the Day" — generic SEO | Высокая | Среднее | Final name brainstorm в фазе 8 до submission. Distinctive, brandable |
| Brand identity = Spotify clone (зелёный) | Текущая реальность | Среднее | В фазе 6 design system — своя палитра, замена `#1db954` |
| MusicBrainz rate limit на росте (50k+ DAU) | Низкая при v1 | Среднее | Cache-first + non-blocking enrichment + nightly pre-warm cron. На v1 (до 5k DAU) проблема не возникает — расчёт в §4.1 |
| Юридические претензии от RYM/AOTY если попытаемся скрейпить | Низкая (если не делаем) | Очень высокое | **Не делаем**. Только официальные API |
| Цена Supabase при росте | Низкая в MVP | Среднее | Free tier до 500 MAU, далее $25/мес — приемлемо |
| Я выгорю на длинном проекте | **Высокая** | Очень высокое | Точки проверки каждые 1–2 недели, deliverable на телефоне каждую фазу, бета как мотивация |

---

## 8. Что прямо сейчас (next actions)

1. Зарегистрироваться на developer.spotify.com → создать app → сохранить Client ID/Secret
2. Зарегистрироваться на supabase.com → создать проект → сохранить anon key и service role key
3. Получить Last.fm API key
4. Зарегистрироваться на expo.dev
5. Установить Node.js LTS + Expo CLI
6. Установить Expo Go на iPhone
7. **Provoder research** — 5 знакомых меломанов: показать описание идеи, спросить "пользовался бы? за что готов заплатить?"
8. Завести git репо (если ещё не) и commit'нуть этот мастер-план

После этого — открыть Claude Code и сказать: _"Начнём фазу 1. Создай Expo + TypeScript проект с expo-router, четырьмя экранами (Home, Library, Friends, Profile) и подключённым Supabase согласно плану в plans/master-plan.md"_

---

## 9. Открытые вопросы (решаем по ходу)

- [ ] Стиль UI: минимализм (типа Things 3) vs богатый визуал (типа Marvis)? → решаем в фазе 6 с дизайн-моками
- [x] Структура нижней навигации: **Home / Discoveries / Profile** (3 таба, финальная для v1).
      Эволюция: исходно Home/Library/Friends/Profile → Library заменён на Discoveries
      (2026-05-24) → Friends → Stats (2026-05-25 morning, социалка в v2) →
      Stats merged в Profile (2026-05-25 evening, 3 таба чище).
- [x] Учитывать ли Spotify playlists юзера: решено в фазе 3 — только Saved Albums
      + Saved Tracks с агрегацией через TRACK_THRESHOLD=4.
- [x] Скейл оценки: **5 эмоциональных уровней** (Loved it / Liked it / It was alright /
      Not for me / Bad), маппинг 1–5 в БД. Plain word labels, без эмодзи как primary.
      Решено 2026-05-25.
- [x] Кормят ли ratings алгоритм: **НЕТ**. Ratings = personal journal, алгоритм читает
      только library + recommendation_history. Решено 2026-05-25.
- [x] Skip mechanic: **не существует**. Юзер не открыл/не рейтнул → альбом остаётся
      в Discoveries как `pending`. Решено 2026-05-25.
- [x] Genre ranking в алгоритме: **не используется**. Artist-similarity + audio features.
      Решено 2026-05-25.
- [x] Локализация: **только английский в v1**. RU и др. — после launch. Решено 2026-05-25.
- [ ] Streak-механика visual в Profile: какой триггер reset? (пропустил день opened? пропустил день rated?) → решаем в фазе 6
- [ ] Final app name → фаза 8 brainstorm перед submission
- [ ] Final brand palette → фаза 6 design system
- [ ] Монетизация: возвращаемся к этому вопросу после closed beta

---

## 10. Процесс работы с Claude Code

**Принципы:**
1. Работаем фаза за фазой. Не прыгаем вперёд.
2. В конце каждой фазы — commit + проверка на телефоне.
3. Если что-то непонятно в плане — спрашиваем в обычном Claude чате до начала кода.
4. Каждая Claude Code сессия начинается с указания: "мы сейчас в фазе N, делаем Y".
5. Сложные решения (схема БД, алгоритм) — сначала обсуждаем, потом кодим.
6. После каждой завершённой фичи — обновляем этот документ (раздел "Что изменилось").

**Что я (юзер) делаю руками:**
- Регистрации в сервисах, получение ключей
- Тестирование на iPhone
- Решения по продукту (UI, фичи)
- Сбор фидбека от беты

**Что делает Claude Code:**
- Весь код
- Миграции БД
- Edge Functions
- Конфиги Expo/EAS
- Git операции

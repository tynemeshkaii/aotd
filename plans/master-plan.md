# Album of the Day — Генеральный мастер-план

> Документ, на который мы опираемся на протяжении всей разработки. Обновляется по ходу — в конце каждой фазы фиксируем что изменилось.

**Последнее обновление:** 2026-05-23
**Статус:** Pre-development. Фаза 0 ещё не начата.

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
| Социальный слой | Пост-MVP (фаза 7+) | Сначала валидация core-loop |
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

**Differentiators:**
1. Интеграция с библиотекой стриминга (исключает то, что уже слушал)
2. Один альбом — не паралич выбора
3. Полный альбом, не сингл/трек
4. Социальный слой (фаза 2)

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
├── selection_reason (jsonb: какие жанры/артисты повлияли)
├── status ('pending' | 'opened' | 'listened' | 'rated' | 'skipped')
├── opened_at
└── created_at

-- Оценки
ratings
├── id
├── user_id
├── album_id → albums.id
├── album_of_the_day_id (nullable — можно оценить альбом не из рекомендации)
├── score (1–10)
├── comment (text, nullable)
├── is_public (для соцфич, default false)
├── created_at
└── updated_at

-- Анти-дубликаты: что уже рекомендовали
recommendation_history
├── id
├── user_id
├── album_id
└── recommended_at
(индекс на user_id + album_id)

-- Для будущего (фаза 7+, но колонки можно заложить заранее)
friendships
├── id, requester_id, addressee_id, status, created_at

activity_feed
├── id, user_id, type, payload (jsonb), created_at
```

### 3.1. Критические RLS-политики

- `streaming_connections`: SELECT/UPDATE только `auth.uid() = user_id`
- `user_library`: то же
- `ratings`: SELECT — owner OR (is_public AND friend)
- `albums`: SELECT для всех аутентифицированных (общий кэш)

---

## 4. Алгоритм рекомендации (детально)

### 4.1. Версия 1 — MVP (фаза 4)

**Вход:** user_id, текущая дата.
**Выход:** один `album_id`, который становится "альбомом дня".

**Алгоритм:**

```
1. AGGREGATE USER TASTE:
   - Из user_library взять последние 500 добавленных альбомов
   - Через MusicBrainz/Spotify обогатить жанрами
   - Построить distribution жанров (топ-5 + долгий хвост)
   - Топ-20 артистов по частоте

2. CANDIDATE GENERATION (target: 300–500 кандидатов):
   - Last.fm: top albums по топ-5 жанрам (50 на жанр)
   - Last.fm: similar artists для топ-20 артистов → их топ альбомы
   - MusicBrainz: альбомы тех же годов в тех же жанрах

3. FILTERING:
   - Исключить всё что есть в user_library (по mb_release_group_id)
   - Исключить всё что в recommendation_history за последние 365 дней
   - Исключить альбомы < 6 треков (вряд ли "альбом" в полном смысле)
   - Исключить compilations/live (типы релиза в MusicBrainz)

4. SCORING:
   score = (
     0.4 * normalized(lastfm_listeners) +
     0.2 * normalized(lastfm_playcount) +
     0.2 * genre_match_score +
     0.1 * artist_proximity_score +
     0.1 * random_factor
   )

5. SELECTION:
   - Взять top-20 по score
   - Случайно выбрать 1 из top-20 (для разнообразия)
   - Записать в albums_of_the_day с selection_reason

6. FALLBACK:
   - Если кандидатов <10 — расширить жанры до топ-10
   - Если всё ещё <10 — взять globally top-rated альбомы за случайный год
```

### 4.2. Версии 2+ (после фидбека)

- Учёт оценок самого юзера (если поставил <5 — снижаем вес похожих)
- Учёт оценок друзей (фаза 7+)
- Variety controls: не рекомендовать 3 jazz альбома подряд
- Mood/season: возможно, "осенью больше шугейза"
- Discogs/AOTY/RYM scores как дополнительные сигналы

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

> Главные отличия от исходного `album-of-the-day-plan.md`: разнесена валидация, добавлены legal/research-шаги, добавлены аналитика и observability, социальный слой сдвинут.

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
- 4 базовых экрана-заглушки: Home, Library, Friends, Profile
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

### Фаза 3 — Импорт библиотеки (1–2 недели)

- Edge Function `sync-spotify-library`:
  - Постранично (limit=50) тянет `/me/albums`
  - Также `/me/playlists` → саундтрек проектов "слышал"? — **обсуждаем, нужно ли**
  - Записывает в `user_library`
  - Дедуплицирует через MusicBrainz lookup (по artist+title)
- Экран Library: список с поиском
- Кнопка "Sync" в Profile
- Автосинк раз в 24 часа

**Точка проверки:** библиотека юзера полностью в приложении.

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

### Фаза 5 — Карточка альбома и оценки (1–2 недели)

- Дизайн карточки (обложка большая, метаданные, рейтинги)
- Deep link в Spotify (`spotify:album:xxx`)
- UI оценки 1–10 (слайдер или звёзды — A/B на бете)
- Опциональный комментарий
- Статусы: pending → opened (тапнул "Open in Spotify") → listened → rated
- Уведомление "оцените альбом" через 24 часа после opened

**Точка проверки:** полный core loop работает end-to-end.

### Фаза 6 — Polish + аналитика + closed beta (2 недели)

- Push-уведомления (expo-notifications + APNs):
  - Утром: "альбом дня готов"
  - Через 24ч после opened: "как вам?"
- Онбординг (3–4 экрана): что это / connect Spotify / выбор времени push / done
- Error handling: нет интернета, токен истёк, sync упал
- Иконка + сплеш
- **Sentry: полная интеграция** (`@sentry/react-native` + `sentry-expo` config plugin, source maps, тестовый event, замена stub `lib/sentry.ts` рабочим init). Перенесено сюда из фазы 1
- PostHog/Amplitude: ключевые события (login, sync, album_opened, rated, retention)
- **TestFlight closed beta** (10–20 знакомых меломанов)
- Сбор фидбека в Notion 2 недели
- Итерация по тому что больно

**Точка проверки:** 10+ людей пользовались неделю, есть фидбек.

### Фаза 7 — Социальный слой (2–3 недели)

- Поиск пользователей (по email или по Spotify display_name)
- Friend requests
- Feed: что друзья оценивали сегодня/неделя
- Лайки на оценки
- Privacy: оценка private/friends/public
- Профиль с историей оценок и любимыми жанрами

### Фаза 8 — App Store release (1–2 недели)

- App Store screenshots (через Figma/Apple presets)
- Описание, ключевые слова, категория (Music)
- Privacy nutrition labels (Spotify data, push)
- Apple Developer Program ($99)
- EAS build production
- Submit + iterate если reject
- Soft launch в 1–2 странах (e.g., только US/RU)

### Фаза 9+ — Постлонч (бесконечно)

- Apple Music (MusicKit интеграция) — большой проект сам по себе
- YouTube Music через workaround
- Веб-версия / landing с импортом профиля
- Подписка с RevenueCat (если retention оправдает)
- Дополнительные источники рейтингов (Discogs, AOTY partnership)
- AI-features: "почему именно этот альбом" объяснение через LLM

---

## 6. Таймлайн (с буфером)

| Период | Фаза | Деливерабл |
|---|---|---|
| Неделя 1 | 0 | Среда + research |
| Неделя 2 | 1 | Скелет |
| Неделя 3–4 | 2 | Auth |
| Неделя 5–6 | 3 | Импорт |
| Неделя 7–9 | 4 | Алгоритм |
| Неделя 10–11 | 5 | Карточка + оценки |
| Неделя 12–13 | 6 | Polish + closed beta |
| Неделя 14–15 | (буфер на фидбек итерации) | — |
| Неделя 16–18 | 7 | Соцслой |
| Неделя 19–20 | 8 | App Store release |

**Реалистичная оценка: 4.5–5 месяцев** до публичного релиза при работе 10–15 ч/неделю.
Без социального слоя релиз возможен на неделе 14–15.

---

## 7. Риски и митигации

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Spotify ужесточит API (как было в 2024) | Средняя | Высокое | Архитектура с провайдерами, не зависим только от Spotify |
| Apple отклонит app (например, за "альбом дня" формат рядом с Music app) | Низкая | Среднее | На бете отшлифовать, не позиционировать как замену Music |
| Алгоритм даёт скучные рекомендации | Высокая | Высокое | Closed beta, фидбек до релиза, версионирование алгоритма |
| Low retention (юзер не возвращается каждый день) | Высокая | Очень высокое | Push, streak-механика, dub-кнопка "оценить позже", соцслой как ретеншн-драйвер |
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

- [ ] Стиль UI: минимализм (типа Things 3) vs богатый визуал (типа Marvis)? → решаем в фазе 5 с дизайн-моками
- [ ] Учитывать ли Spotify playlists юзера, не только "Saved albums"? → решаем в фазе 3
- [ ] Скейл оценки: 1–10, 1–5 звёзд, или 1–100? → A/B на бете
- [ ] Streak-механика? → решаем после первых данных retention
- [ ] Локализация: только английский, или сразу RU+EN? → решаем перед App Store submission
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

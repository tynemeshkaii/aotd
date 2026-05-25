# Фаза 4 — Алгоритм рекомендации "Альбом дня"

> Детальный план реализации. Опирается на [master-plan.md](./master-plan.md) §4 и зафиксированные решения из concept-refinement pass (2026-05-25 — 2026-05-26).
> Сроки: 3–3.5 недели (18–22 рабочих сессии).
> Цель: каждый день в окне ~1 час до `preferred_push_time` юзера Edge Function вычисляет персональный альбом дня, опираясь только на его Spotify-библиотеку и историю рекомендаций. Результат показывается на Home, история — в Discoveries.

---

## 0. Базовые решения (зафиксированы до старта реализации)

| Что | Решение | Обоснование |
|---|---|---|
| Входы алгоритма | **`user_library` + `recommendation_history` only** | Ratings — personal journal, не feed-back loop. Library-driven causality предсказуема для юзера, нет filter-bubble drift |
| Жанровая таксономия | **Не используется в scoring** | Таксономия broken (особенно для underground). Работаем на artist-similarity + альбомные сигналы Last.fm |
| Главный сигнал | **Last.fm `artist.getSimilar` + `artist.getTopAlbums`** | Last.fm стабилен, не привязан к Spotify scopes, выдаёт **топ-альбом** артиста (то что нам нужно), а не chronological catalog |
| Опциональный сигнал | **Spotify `/audio-features`** (energy/valence/dance/acoust/instr/tempo) | В v1 только capability check + tasteVector/debug. В scoring v1 **не участвует**, потому что candidate album features сознательно не семплим до v1.5 |
| Spotify в pipeline | **`/search?type=album` для метаданных + `spotify_id` для deep link** | Никакой hard dependency на restricted endpoints. `/search` доступен всем apps |
| Spotify related-artists | **Опционально, бонусный источник similar artists** | Если работает — добавляем в pool. Если 403 — игнорируем, Last.fm `getSimilar` достаточен |
| MusicBrainz | **Отдельный cache-first lookup, non-blocking** | Используется для dedup через release-group ID и определения compilation/live. Lookup ограничиваем и кэшируем, чтобы не упереться в 1 req/sec |
| Day-1 timing | **Сразу после успешного library sync** | Юзер видит первую рекомендацию в первой сессии. Лучший first-time experience |
| Failure fallback | **Curated globally-acclaimed pick из prewarm cache** | Юзер получает альбом после первого prewarm. `fallback_reason` enum фиксирует причину; до beta prewarm — обязательный gate |
| Cache strategy | **Lazy + nightly pre-warm** | Lazy lookup при compute + nightly cron подсасывает top Last.fm. Через 2-3 недели cache hit rate ~85% |
| Manual trigger в UI | **Не существует** | Только cron + day-1 post-sync. Дебаг через SQL/curl |
| Compute timing | **За ~1 час до `preferred_push_time` юзера** | Окно даёт буфер. Cron каждый час, выбирает due users через timezone-aware RPC |
| Algorithm idempotency | **`UNIQUE(user_id, date)` на `albums_of_the_day`** | Повторный compute в тот же день — no-op (ритуал "один альбом") |
| Repeat policy | **Никогда не повторяем альбом**: exact Spotify ID + MusicBrainz release group + normalized `artist + album`; `recommendation_history` остается audit trail | Это discovery-приложение, мы расширяем catalog. Spotify alternate editions/remasters не должны обходить repeat guard |
| Artist-diversity guard | **Не более 1 альбома одного primary_artist за 30 дней** | Без этого Aphex Twin может выпадать 3 дня подряд (разные альбомы). Дёшево, сильно повышает ощущение разнообразия |
| Min album quality | **≥ 6 треков ИЛИ ≥ 20 минут**, exclude compilations/live/soundtracks | `total_tracks >= 6` — быстрый путь; для 3–5 треков делаем Spotify album-tracks duration check перед допуском |
| Algorithm version | `albums_of_the_day.algorithm_version` int, начинаем с **1** | A/B и historical rollback |
| RNG в scoring | **Injectable `rng: () => number`** | Detereministic тесты с seed. В production — `Math.random` |

---

> Post-implementation correction (2026-05-25): final code includes a follow-up patch beyond some inline snippets below. `ensure_recommendation_atomic` must use `INSERT ... ON CONFLICT DO NOTHING` instead of check-then-insert, and candidate/fallback exclusion must combine Spotify album IDs, MusicBrainz release groups, and normalized `artist + album` keys from both `user_library` and `recommendation_history`.

## Current implementation status

Phase 4 is implemented, hardened, and acceptance-tested end-to-end (2026-05-25). Treat the checked-in files as authoritative when they differ from design-era snippets in this document:

- SQL migrations are now five files, ending with `20260526040000_phase4_recommendation_fixes.sql`.
- `ensure_recommendation_atomic` is race-safe: it inserts into `albums_of_the_day` with `ON CONFLICT (user_id, date) DO NOTHING`, then returns the existing pick if another worker already won the race. Confirmed under parallel curl invocations on the same `(user_id, date)`.
- Repeat/library exclusion uses three keys together: exact Spotify album ID, MusicBrainz release group ID, and normalized `artist + album` from `album-dedupe.ts`.
- Both primary candidate generation and `curated-fallback.ts` use the same repeat guard shape.
- Client updates to `albums_of_the_day` can only move forward through `pending -> opened -> rated`; immutable recommendation fields and `opened_at` are protected by trigger.
- `compute-album-of-the-day` is **production-hardened against Spotify 429 cascades.** `spotifyFetch` caps 429 retries to 1 and Retry-After to ≤ 1s (`_shared/spotify-extended.ts`). Primary candidate generation skips `album.getInfo`, the Spotify album-detail lookup, and the in-loop MusicBrainz pass via the `skipAlbumInfoLookup` / `skipAlbumDetailsLookup` / `skipMusicBrainz` flags on `generateCandidates`; MusicBrainz validation runs once post-scoring on the chosen candidate (`validateCandidateWithMb`, up to 3 retries before shipping the best non-validated candidate).
- **Diagnostic mode**: `compute-album-of-the-day` accepts `"diag": true` in the request body and returns a `diag` array of per-stage timings. Compute-stage `at_ms` is request-relative; candidate-generation `at_ms` is candidate-internal-relative.
- `prewarm-album-cache` has an OPTIONS handler, method guard, and `!cronSecret` undefined check, matching the auth surface of `compute-album-of-the-day`.
- `npm run typecheck`, `npm run lint`, and `deno test _shared/recommendation-algorithm.test.ts` (4/4 passing) all green.
- See `plans/phase-4-implementation.md` § "Session 2 — Production hardening" for the post-mortem and acceptance test log.

## 1. Архитектура (high-level)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TASK 0: API capability smoke-test (runs MANUALLY before migration) │
│    curl Spotify endpoints:                                          │
│      /me/top/tracks         → expect 200 (need user-top-read scope) │
│      /artists/{id}/related-artists → 200 or 403?                    │
│      /audio-features?ids=… → 200 or 403?                            │
│    curl Last.fm endpoints:                                          │
│      artist.getsimilar     → expect 200                             │
│      artist.gettopalbums   → expect 200                             │
│    Result captured in plans/phase-4-api-smoketest.md                │
│    → algorithm shape stays same; audio_features documented for      │
│      v1.5, spotify related-artists used only if available           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  pg_cron (every hour at :00)                                        │
│    └── net.http_post(/dispatch-daily-picks, CRON_SECRET)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Edge Function: dispatch-daily-picks                                │
│    1. find_users_due_for_compute()                                  │
│       — timestamp-based (not time-based) window check               │
│       — handles midnight wraparound correctly                       │
│    2. for each user (concurrency 5):                                │
│       fetch /compute-album-of-the-day { user_id, target_date, tz }  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Edge Function: compute-album-of-the-day                            │
│    1. validate CRON_SECRET                                          │
│    2. idempotency: SELECT albums_of_the_day WHERE user_id+date      │
│    3. extractTasteSignal(user_id):                                  │
│         - top primary_artist_spotify_id (with name fallback) from   │
│           user_library, weighted by frequency                       │
│         - if /me/top/tracks + /audio-features available — compute   │
│           tasteVector for debug/v1.5 readiness (not scoring v1)     │
│    4. generateCandidates(taste):  ★ LAST.FM PRIMARY PATH            │
│         FOR each top-20 source_artist:                              │
│           lastfm.artist.getSimilar → up to 20 similar               │
│           [optional] spotify related-artists if endpoint works      │
│         FOR each similar artist (top-N):                            │
│           lastfm.artist.getTopAlbums → top 3 albums                 │
│           spotify.search(album+artist) → spotify_id + metadata      │
│           short albums (3–5 tracks) → spotify album-tracks duration │
│           musicbrainz release-group cache → filter compilation/live │
│    5. filterCandidates: exclude library, history (all-time),        │
│         by Spotify ID + MB release group + normalized artist/album, │
│         < 6 tracks, < 20min, compilations/live, artist-diversity    │
│         guard (no same primary_artist in last 30d)                  │
│    6. scoreAndSelect with NEW weights:                              │
│         0.45·artist_similarity_match                                │
│         + 0.20·source_artist_frequency_log                          │
│         + 0.20·popularity_log_percentile  (listeners/playcount pool)│
│         + 0.05·release_balance  (decade vs library)                 │
│         + 0.10·sampling_temperature  (random)                       │
│    7. on success → upsert albums + INSERT albums_of_the_day +       │
│       INSERT recommendation_history (atomic RPC)                    │
│    8. on failure → curatedFallback() + fallback_reason set          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Realtime publication: albums_of_the_day                            │
│  Client:                                                            │
│    useTodayPick() → RPC get_current_pick(user_id)                   │
│      — server-side timezone resolution                              │
│      — no client-side UTC date guesswork                            │
│    Realtime INSERT on albums_of_the_day → invalidate query          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  pg_cron (daily at 03:00 UTC) → /prewarm-album-cache                │
│    fetches Last.fm globally-top albums → Spotify /search for IDs    │
│    → upsert into albums with is_prewarm_seed=true                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Day-1 trigger:                                                     │
│  sync-spotify-library on status='completed' →                       │
│    fire-and-forget /compute-album-of-the-day { user_id, today }     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Изменения в проекте

### 2.1. Новые файлы

```
plans/
└── phase-4-api-smoketest.md                            # Task 0 results

supabase/
├── migrations/
│   ├── 20260526000000_phase4_user_library_artist_ids.sql
│   ├── 20260526010000_phase4_streaming_product.sql
│   ├── 20260526020000_phase4_recommendation_schema.sql
│   ├── 20260526030000_phase4_recommendation_rpcs.sql
│   └── 20260526040000_phase4_recommendation_fixes.sql
└── functions/
    ├── _shared/
    │   ├── lastfm.ts                                   # Last.fm API client (PRIMARY signal)
    │   ├── musicbrainz.ts                              # MB API client (rate-limited cache-first)
    │   ├── spotify-extended.ts                         # /search, /audio-features (opt), related-artists (opt)
    │   ├── album-dedupe.ts                             # normalized artist+album repeat key
    │   ├── external-cache.ts                           # cache-first wrappers (flexible key)
    │   ├── taste-extraction.ts                         # taste signal from user_library
    │   ├── candidate-generation.ts                     # Last.fm-driven pool
    │   ├── recommendation-algorithm.ts                 # PURE: scoring + selection (RNG injectable)
    │   ├── curated-fallback.ts                         # fallback pick logic
    │   └── rng.ts                                      # seeded RNG helper
    ├── compute-album-of-the-day/
    │   ├── index.ts
    │   └── deno.json
    ├── dispatch-daily-picks/
    │   ├── index.ts
    │   └── deno.json
    └── prewarm-album-cache/
        ├── index.ts
        └── deno.json

lib/
├── hooks/
│   └── useTodayPick.ts                                 # RPC-based, timezone-correct
└── recommendation.ts                                   # types + formatSelectionReason

components/
└── home/
    ├── TodayCard.tsx                                   # placeholder (styled in phase 5)
    └── WaitingForPick.tsx                              # "Your pick is brewing..."

tests/                                                  # NEW dir
└── algorithm-fixtures.ts                               # 3 golden profiles for deterministic tests
```

### 2.2. Изменения в существующих файлах

- `app/(tabs)/index.tsx` — Home: показывает `TodayCard` если pick есть, иначе `WaitingForPick`
- `supabase/functions/sync-spotify-library/index.ts`:
  - При `status='completed'` → fire-and-forget вызов compute (day-1 instant pick)
  - При sync — заполнять новые поля `user_library.primary_artist_spotify_id`, `artist_ids`
- `lib/auth.ts` — добавить scope `user-read-private`, иначе Spotify `/me.product` и `/me.country` официально не доступны
- `supabase/functions/upsert-streaming-connection/index.ts` — парсит `product` из `/me` и пишет в `streaming_connections.spotify_product`
- `supabase/functions/_shared/spotify.ts` — `fetchSpotifyProfile` возвращает `product` (расширяем тип)
- `supabase/config.toml` — `verify_jwt = false` для трёх новых функций
- `types/database.ts` — регенерируется после миграций

---

## 3. Схема БД (4 миграции в порядке)

### 3.1. `20260526000000_phase4_user_library_artist_ids.sql`

```sql
-- Phase 4 prep: capture Spotify artist IDs in user_library so the algorithm
-- can lookup similar artists without a name search round-trip.
-- Existing rows have NULL until the next sync runs; algorithm handles both.

alter table public.user_library
  add column if not exists primary_artist_spotify_id text,
  add column if not exists artist_ids jsonb;  -- [{id, name}, ...] for collabs

create index if not exists user_library_primary_artist_idx
  on public.user_library(primary_artist_spotify_id)
  where primary_artist_spotify_id is not null;
```

> sync-spotify-library уже получает `artists[]` от Spotify — мы просто перестанем их игнорировать.

### 3.2. `20260526010000_phase4_streaming_product.sql`

```sql
-- Phase 4 prep: capture Spotify product type (Premium/Free) for the explainer
-- in phase 5. Stored in connections; exposed via the safe view.

alter table public.streaming_connections
  add column if not exists spotify_product text
  check (spotify_product is null or spotify_product in ('premium', 'free', 'open'));

-- Rebuild safe view to expose spotify_product.
-- Keep security definer (security_invoker = false) per CLAUDE.md rule.
drop view if exists public.streaming_connections_safe;
create view public.streaming_connections_safe as
  select
    id, user_id, provider, provider_user_id, scopes,
    spotify_product,
    connected_at, last_synced_at
  from public.streaming_connections
  where auth.uid() = user_id;

alter view public.streaming_connections_safe set (security_invoker = false);
grant select on public.streaming_connections_safe to authenticated;
```

### 3.3. `20260526020000_phase4_recommendation_schema.sql`

```sql
-- Phase 4: recommendation algorithm data layer.

-- 1) albums: global cached metadata. Public read for any authed user.
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  spotify_id text unique not null,
  -- Not unique: Spotify can expose multiple editions/remasters that resolve to
  -- the same MusicBrainz release-group. We dedupe per-user at candidate time,
  -- but don't let a cache row fail because of an alternate Spotify edition.
  mb_release_group_id text,
  title text not null,
  primary_artist_name text not null,
  primary_artist_spotify_id text,
  release_year integer,
  cover_url text,
  total_tracks integer,
  duration_ms integer,
  album_type text,                                     -- 'album'|'single'|'compilation'
  lastfm_listeners bigint,
  lastfm_playcount bigint,
  lastfm_url text,
  audio_features jsonb,                                -- optional, populated when available
  is_prewarm_seed boolean not null default false,
  metadata_updated_at timestamptz not null default now()
);

create index albums_spotify_idx on public.albums(spotify_id);
create index albums_mb_idx on public.albums(mb_release_group_id)
  where mb_release_group_id is not null;
create index albums_primary_artist_idx on public.albums(primary_artist_spotify_id)
  where primary_artist_spotify_id is not null;
create index albums_listeners_idx on public.albums(lastfm_listeners desc nulls last);
create index albums_playcount_idx on public.albums(lastfm_playcount desc nulls last);
create index albums_prewarm_idx on public.albums(is_prewarm_seed)
  where is_prewarm_seed = true;

alter table public.albums enable row level security;
revoke all on public.albums from anon, authenticated;
grant select on public.albums to authenticated;
create policy "albums_select_all" on public.albums
  for select using (auth.role() = 'authenticated');

-- 2) artist_similarity_cache with FLEXIBLE KEY.
-- source_artist_key examples:
--   'spotify:abc123'    — when Spotify artist ID known
--   'lastfm:aphex twin' — when only name (lowercased+trimmed) known
create table public.artist_similarity_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('lastfm', 'spotify')),
  source_artist_key text not null,
  source_artist_name text not null,
  similar_artists jsonb not null,                              -- [{name, spotify_id?, match}]
  fetched_at timestamptz not null default now(),
  unique (source, source_artist_key)
);

create index artist_sim_fetched_idx on public.artist_similarity_cache(fetched_at);

alter table public.artist_similarity_cache enable row level security;
revoke all on public.artist_similarity_cache from anon, authenticated;
-- service role only; clients never read directly.

-- 3) audio_features_cache (per Spotify track ID).
create table public.audio_features_cache (
  spotify_track_id text primary key,
  features jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.audio_features_cache enable row level security;
revoke all on public.audio_features_cache from anon, authenticated;
-- service role only.

-- 4) musicbrainz_release_group_cache: per normalized artist+album lookup.
-- This is separate from albums because candidate filtering happens before a
-- candidate is necessarily selected/upserted into albums.
create table public.musicbrainz_release_group_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_artist text not null,
  normalized_album text not null,
  release_group_id text,
  primary_type text,
  secondary_types text[] not null default '{}',
  first_release_date text,
  fetched_at timestamptz not null default now(),
  unique (normalized_artist, normalized_album)
);

create index mb_rg_cache_fetched_idx on public.musicbrainz_release_group_cache(fetched_at);
create index mb_rg_cache_release_group_idx on public.musicbrainz_release_group_cache(release_group_id)
  where release_group_id is not null;

alter table public.musicbrainz_release_group_cache enable row level security;
revoke all on public.musicbrainz_release_group_cache from anon, authenticated;
-- service role only.

-- 5) albums_of_the_day with fallback_reason.
create table public.albums_of_the_day (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  album_id uuid not null references public.albums(id),
  algorithm_version integer not null default 1,
  selection_reason jsonb not null,
  status text not null check (status in ('pending', 'opened', 'rated')) default 'pending',
  opened_at timestamptz,
  is_fallback boolean not null default false,
  fallback_reason text
    check (
      (is_fallback = false and fallback_reason is null)
      or (is_fallback = true and fallback_reason in (
        'no_candidates',
        'spotify_search_failed',
        'spotify_audio_unavailable',
        'lastfm_unavailable',
        'mb_timeout',
        'library_too_small',
        'compute_timeout',
        'unknown_error'
      ))
    ),
  user_timezone_at_compute text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index aotd_user_date_idx on public.albums_of_the_day(user_id, date desc);

alter table public.albums_of_the_day enable row level security;
revoke all on public.albums_of_the_day from anon, authenticated;
grant select, update on public.albums_of_the_day to authenticated;

create policy "aotd_select_own" on public.albums_of_the_day
  for select using (auth.uid() = user_id);

create policy "aotd_update_own_status" on public.albums_of_the_day
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Guard: clients may only mutate status/opened_at; everything else is immutable
-- to them. Service role bypasses this check.
create or replace function public.aotd_guard_client_update()
returns trigger language plpgsql as $$
begin
  if old.user_id is distinct from new.user_id
     or old.album_id is distinct from new.album_id
     or old.date is distinct from new.date
     or old.algorithm_version is distinct from new.algorithm_version
     or old.selection_reason is distinct from new.selection_reason
     or old.is_fallback is distinct from new.is_fallback
     or old.fallback_reason is distinct from new.fallback_reason
     or old.user_timezone_at_compute is distinct from new.user_timezone_at_compute
     or old.created_at is distinct from new.created_at
  then
    raise exception 'aotd_immutable_field';
  end if;
  return new;
end;
$$;

create trigger aotd_guard_client_update_trg
  before update on public.albums_of_the_day
  for each row
  -- Bypass for service-role Edge Function writes. Use the JWT role claim;
  -- `current_user` is not reliable under PostgREST because requests may run
  -- through the authenticator role.
  when (coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') <> 'service_role')
  execute procedure public.aotd_guard_client_update();

alter publication supabase_realtime add table public.albums_of_the_day;

-- 6) recommendation_history: never recommend same album twice ever (per user).
create table public.recommendation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id),
  recommended_at timestamptz not null default now(),
  unique (user_id, album_id)
);

create index reco_history_user_idx on public.recommendation_history(user_id, recommended_at desc);

alter table public.recommendation_history enable row level security;
revoke all on public.recommendation_history from anon, authenticated;
-- client never reads directly; algorithm uses service role.
```

### 3.4. `20260526030000_phase4_recommendation_rpcs.sql`

```sql
-- Phase 4 RPCs:
-- 1) find_users_due_for_compute  — timezone-correct (timestamp-based)
-- 2) ensure_recommendation_atomic — idempotent insert of pick + history
-- 3) get_current_pick             — client-facing, server-resolves timezone
-- 4) resolve_user_compute_context — service RPC for day-1 target date/tz

-- ===========================================================================
-- 1) find_users_due_for_compute
-- ===========================================================================
-- Returns users whose preferred push timestamp falls within the next
-- p_lead_minutes window IN THEIR LOCAL TIMEZONE. Handles midnight wraparound
-- by considering both today's and tomorrow's push timestamps.
create or replace function public.find_users_due_for_compute(p_lead_minutes int default 60)
returns table (
  user_id uuid,
  target_date date,
  user_tz text,
  push_time time
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cands as (
    select
      p.id as user_id,
      coalesce(p.timezone, 'UTC') as tz,
      coalesce(p.preferred_push_time, '08:00'::time) as push_t
    from public.profiles p
    where exists (
      select 1 from public.streaming_connections sc
      where sc.user_id = p.id and sc.provider = 'spotify'
    )
    and exists (
      select 1 from public.library_sync_status lss
      where lss.user_id = p.id and lss.aggregated_albums_count is not null
    )
  ),
  -- Cast now() into each user's local zone (returns naive timestamp).
  local_clock as (
    select
      c.user_id,
      c.tz,
      c.push_t,
      (now() at time zone c.tz)::timestamp as local_now
    from cands c
  ),
  -- For each user, generate two candidate push timestamps:
  -- today's push and tomorrow's push (handles cases like push_t=00:15
  -- when local_now=23:50, where today_push is in the past but tomorrow_push
  -- is within the window).
  pushes as (
    select
      lc.user_id,
      lc.tz,
      lc.push_t,
      lc.local_now,
      (lc.local_now::date + lc.push_t)::timestamp as today_push,
      ((lc.local_now::date + interval '1 day')::date + lc.push_t)::timestamp as tomorrow_push
    from local_clock lc
  ),
  windowed as (
    select
      p.user_id,
      p.tz,
      p.push_t,
      case
        when p.today_push between p.local_now
                              and p.local_now + (p_lead_minutes || ' minutes')::interval
          then p.today_push::date
        when p.tomorrow_push between p.local_now
                                 and p.local_now + (p_lead_minutes || ' minutes')::interval
          then p.tomorrow_push::date
        else null
      end as resolved_target_date
    from pushes p
  )
  select
    w.user_id,
    w.resolved_target_date,
    w.tz,
    w.push_t
  from windowed w
  where w.resolved_target_date is not null
    and not exists (
      select 1 from public.albums_of_the_day aotd
      where aotd.user_id = w.user_id and aotd.date = w.resolved_target_date
    );
end;
$$;

revoke all on function public.find_users_due_for_compute(int) from public;
grant execute on function public.find_users_due_for_compute(int) to service_role;

-- ===========================================================================
-- 2) ensure_recommendation_atomic
-- ===========================================================================
create or replace function public.ensure_recommendation_atomic(
  p_user_id uuid,
  p_album_id uuid,
  p_date date,
  p_algorithm_version int,
  p_selection_reason jsonb,
  p_is_fallback boolean,
  p_fallback_reason text,
  p_user_timezone text
)
returns table (created boolean, aotd_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  insert into public.albums_of_the_day (
    user_id, date, album_id, algorithm_version, selection_reason,
    is_fallback, fallback_reason, user_timezone_at_compute
  ) values (
    p_user_id, p_date, p_album_id, p_algorithm_version, p_selection_reason,
    p_is_fallback, p_fallback_reason, p_user_timezone
  )
  on conflict (user_id, date) do nothing
  returning id into new_id;

  if new_id is null then
    select id into existing_id from public.albums_of_the_day
      where user_id = p_user_id and date = p_date;

    return query select false, existing_id;
    return;
  end if;

  insert into public.recommendation_history (user_id, album_id)
    values (p_user_id, p_album_id)
    on conflict (user_id, album_id) do nothing;

  return query select true, new_id;
end;
$$;

revoke all on function public.ensure_recommendation_atomic(uuid, uuid, date, int, jsonb, boolean, text, text) from public;
grant execute on function public.ensure_recommendation_atomic(uuid, uuid, date, int, jsonb, boolean, text, text) to service_role;

-- ===========================================================================
-- 3) get_current_pick
-- ===========================================================================
-- Returns the user's pick for "today" in THEIR LOCAL TIMEZONE.
-- The client doesn't compute date itself — server is the source of truth.
create or replace function public.get_current_pick(p_user_id uuid)
returns table (
  aotd_id uuid,
  pick_date date,
  status text,
  is_fallback boolean,
  fallback_reason text,
  selection_reason jsonb,
  opened_at timestamptz,
  album_id uuid,
  album_title text,
  album_primary_artist_name text,
  album_cover_url text,
  album_spotify_id text,
  album_release_year int,
  album_total_tracks int,
  album_duration_ms int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tz text;
  today_local date;
begin
  -- Auth check: caller (via authenticated JWT) must be the user.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  select coalesce(p.timezone, 'UTC') into user_tz
  from public.profiles p where p.id = p_user_id;

  today_local := (now() at time zone coalesce(user_tz, 'UTC'))::date;

  return query
  select
    aotd.id,
    aotd.date,
    aotd.status,
    aotd.is_fallback,
    aotd.fallback_reason,
    aotd.selection_reason,
    aotd.opened_at,
    a.id,
    a.title,
    a.primary_artist_name,
    a.cover_url,
    a.spotify_id,
    a.release_year,
    a.total_tracks,
    a.duration_ms
  from public.albums_of_the_day aotd
  join public.albums a on a.id = aotd.album_id
  where aotd.user_id = p_user_id
    and aotd.date = today_local
  limit 1;
end;
$$;

revoke all on function public.get_current_pick(uuid) from public;
grant execute on function public.get_current_pick(uuid) to authenticated;

-- ===========================================================================
-- 4) resolve_user_compute_context
-- ===========================================================================
-- Service-role helper for compute calls that do not receive target_date/tz
-- (notably day-1 trigger). Keeps timezone math in Postgres instead of JS
-- Date/toLocaleString conversions.
create or replace function public.resolve_user_compute_context(p_user_id uuid)
returns table (
  target_date date,
  user_tz text,
  push_time time
)
language sql
security definer
set search_path = public
as $$
  select
    (now() at time zone coalesce(p.timezone, 'UTC'))::date as target_date,
    coalesce(p.timezone, 'UTC') as user_tz,
    coalesce(p.preferred_push_time, '08:00'::time) as push_time
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.resolve_user_compute_context(uuid) from public;
grant execute on function public.resolve_user_compute_context(uuid) to service_role;
```

### 3.4a. `20260526040000_phase4_recommendation_fixes.sql`

Follow-up migration applied after implementation review:

- Replaces `ensure_recommendation_atomic` with the race-safe `ON CONFLICT (user_id, date) DO NOTHING` version shown above.
- Replaces `aotd_guard_client_update()` so authenticated clients can only move `albums_of_the_day.status` forward through `pending -> opened -> rated`.
- Keeps recommendation fields immutable for client updates.
- Sets `opened_at` automatically when moving to `opened`/`rated`, and prevents later client mutation of `opened_at`.

**Применить (в этом порядке):**
```bash
supabase migration new phase4_user_library_artist_ids       # вставить SQL 3.1
supabase migration new phase4_streaming_product             # вставить SQL 3.2
supabase migration new phase4_recommendation_schema         # вставить SQL 3.3
supabase migration new phase4_recommendation_rpcs           # вставить SQL 3.4
supabase migration new phase4_recommendation_fixes          # вставить follow-up SQL 3.4a
supabase db push
npm run db:types
```

### 3.5. `supabase/config.toml` дополнения

```toml
[functions.compute-album-of-the-day]
verify_jwt = false

[functions.dispatch-daily-picks]
verify_jwt = false

[functions.prewarm-album-cache]
verify_jwt = false
```

### 3.6. Supabase secrets и Vault

**Edge Function secrets:**
```bash
supabase secrets set LASTFM_API_KEY=<key>
supabase secrets set LASTFM_USER_AGENT="AlbumOfTheDay/1.0 (<contact email>)"
supabase secrets set MUSICBRAINZ_USER_AGENT="AlbumOfTheDay/1.0 (<contact email>)"
supabase secrets set CRON_SECRET=<random 48 chars, base64>
```

**Vault для pg_cron (Supabase Dashboard → Settings → Vault):**
- `cron_secret` = тот же CRON_SECRET (для авторизации http_post из cron job)
- `project_url` = `https://<project-ref>.supabase.co`

---

## 4. TASK 0 — API smoke-test (выполняется ПЕРЕД миграциями)

> **Критично.** Проверяем что Spotify endpoints, на которые мы рассчитываем, реально доступны нашему app. Spotify в конце 2024 ограничил `/audio-features`, `/artists/{id}/related-artists`, `/recommendations` для новых приложений.

### 4.1. Что проверяем

| Endpoint | Зачем | План A (200) | План B (403) |
|---|---|---|---|
| Spotify `/me/top/tracks?limit=10&time_range=medium_term` | Источник tracks для optional tasteVector/debug | Сохраняем capability result для v1.5 | Игнорируем, алгоритм v1 не зависит |
| Spotify `/audio-features?ids=...` | Optional tasteVector/debug | Capability documented, но v1 scoring не меняется | Игнорируем, алгоритм v1 не зависит |
| Spotify `/artists/{id}/related-artists` | Доп. источник similar artists | Объединяем с Last.fm getSimilar | Только Last.fm getSimilar |
| Spotify `/search?type=album&q=...` | Metadata + spotify_id для Last.fm-found albums | **Обязательно работает** — без него нет deep link | Если не работает → блокер; ищем альтернативу |
| Spotify `/me` with `user-read-private` | `product` для Free/Premium explainer | `product` populated | `spotify_product=null`, алгоритм не блокируется |
| Last.fm `artist.getsimilar` | Главный источник similar artists | **Обязательно** | Если не работает → блокер; перерабатываем алгоритм |
| Last.fm `artist.gettopalbums` | Главный источник топ-альбомов similar artists | **Обязательно** | Аналогично — блокер |

### 4.2. Как проверять

Один тестовый аккаунт (твой Spotify), один user access token (берём из `streaming_connections` через SQL → расшифровываем), один Last.fm API key. Если токен был выдан до добавления `user-read-private`, переподключить Spotify перед smoke-test, иначе `/me.product` ожидаемо будет null/недоступен.

Скрипт `tests/smoketest-apis.sh`:

```bash
#!/usr/bin/env bash
set -e

SPOTIFY_TOKEN="$1"
LASTFM_KEY="$2"

echo "=== Spotify /me/top/tracks ==="
curl -sS -o /tmp/top-tracks.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=medium_term"

TRACK_ID=$(jq -r '.items[0].id // empty' /tmp/top-tracks.json)

echo "=== Spotify /audio-features ==="
curl -sS -o /tmp/audio.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/audio-features?ids=$TRACK_ID"

ARTIST_ID=$(jq -r '.items[0].artists[0].id // empty' /tmp/top-tracks.json)

echo "=== Spotify /artists/{id}/related-artists ==="
curl -sS -o /tmp/related.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/artists/$ARTIST_ID/related-artists"

echo "=== Spotify /search?type=album ==="
curl -sS -o /tmp/search.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/search?type=album&limit=1&q=Selected%20Ambient%20Works%20Aphex%20Twin"

echo "=== Spotify /me product ==="
curl -sS -o /tmp/me.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/me"

echo "=== Last.fm artist.getsimilar ==="
curl -sS -o /tmp/lfm-similar.json -w "HTTP %{http_code}\n" \
  "https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=Aphex%20Twin&api_key=$LASTFM_KEY&format=json"

echo "=== Last.fm artist.gettopalbums ==="
curl -sS -o /tmp/lfm-topalbums.json -w "HTTP %{http_code}\n" \
  "https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=Aphex%20Twin&api_key=$LASTFM_KEY&format=json&limit=5"
```

Запуск, фиксация результатов в `plans/phase-4-api-smoketest.md`:

```markdown
# Phase 4 API smoke-test results (YYYY-MM-DD)

| Endpoint | HTTP | Notes |
|---|---|---|
| Spotify /me/top/tracks       | 200 / 403 | ... |
| Spotify /audio-features      | 200 / 403 | ... |
| Spotify /artists/.../related | 200 / 403 | ... |
| Spotify /search?type=album   | 200       | ... |
| Spotify /me product          | 200       | product: premium/free/open/null |
| Last.fm artist.getsimilar    | 200       | sample similar count: N |
| Last.fm artist.gettopalbums  | 200       | sample topalbums count: N |

## Plan adjustment

- audio-features: AVAILABLE/UNAVAILABLE → documented only; v1 scoring unchanged
- spotify related-artists: AVAILABLE/UNAVAILABLE → algorithm path Y
- ...
```

### 4.3. Решения на основе результатов

- **Если Spotify /search 403** — блокер. Останавливаемся, разбираемся (это базовый endpoint, не должен быть restricted).
- **Если Last.fm любой endpoint 403/down** — блокер. Возможно ключ невалиден или Last.fm недоступен.
- **Иначе** — продолжаем с планом, `audio_features` и `related-artists` ставим в "optional bonus" в коде по факту.

---

## 5. Внешние API helpers

### 5.1. `_shared/lastfm.ts`

```ts
const BASE = 'https://ws.audioscrobbler.com/2.0/';
const RATE_LIMIT_MS = 200;  // ~5 req/sec; Last.fm official limit
let lastCallAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < RATE_LIMIT_MS) await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  lastCallAt = Date.now();
}

async function lastfmFetch<T = unknown>(params: Record<string, string>): Promise<T> {
  const key = Deno.env.get('LASTFM_API_KEY');
  if (!key) throw new Error('missing_lastfm_key');
  await throttle();
  const url = new URL(BASE);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { 'User-Agent': Deno.env.get('LASTFM_USER_AGENT') ?? 'AlbumOfTheDay/1.0' },
  });
  if (!res.ok) throw new Error(`lastfm_failed:${res.status}`);
  return (await res.json()) as T;
}

export type LastfmSimilarArtist = { name: string; mbid?: string; match: number };

export async function fetchSimilarArtists(artistName: string, mbid?: string): Promise<LastfmSimilarArtist[]> {
  const data = await lastfmFetch<{
    similarartists?: { artist?: { name: string; mbid?: string; match: string }[] };
  }>({
    method: 'artist.getsimilar',
    ...(mbid ? { mbid } : { artist: artistName }),
    autocorrect: '1',
    limit: '30',
  });
  return (data.similarartists?.artist ?? []).map(a => ({
    name: a.name,
    mbid: a.mbid || undefined,
    match: Number.parseFloat(a.match) || 0,
  }));
}

export type LastfmTopAlbum = {
  name: string;
  artist: string;
  mbid?: string;
  playcount?: number;
};

export async function fetchTopAlbumsForArtist(artistName: string, limit = 5): Promise<LastfmTopAlbum[]> {
  const data = await lastfmFetch<{
    topalbums?: { album?: { name: string; artist: { name: string }; mbid?: string; playcount?: string }[] };
  }>({
    method: 'artist.gettopalbums',
    artist: artistName,
    autocorrect: '1',
    limit: String(limit),
  });
  return (data.topalbums?.album ?? [])
    // Keep self-titled albums; they are often canonical. Only remove Last.fm junk rows.
    .filter(a => a.name && a.name !== '(null)')
    .map(a => ({
      name: a.name,
      artist: a.artist.name,
      mbid: a.mbid || undefined,
      playcount: a.playcount ? Number(a.playcount) : undefined,
    }));
}

export async function fetchAlbumInfo(artist: string, album: string): Promise<{
  listeners?: number; playcount?: number; mbid?: string; url?: string;
} | null> {
  try {
    const data = await lastfmFetch<{
      album?: { listeners?: string; playcount?: string; mbid?: string; url?: string };
    }>({
      method: 'album.getinfo',
      artist,
      album,
      autocorrect: '1',
    });
    if (!data.album) return null;
    return {
      listeners: data.album.listeners ? Number(data.album.listeners) : undefined,
      playcount: data.album.playcount ? Number(data.album.playcount) : undefined,
      mbid: data.album.mbid || undefined,
      url: data.album.url,
    };
  } catch {
    return null;  // non-blocking
  }
}

/**
 * Pre-warm seed: globally top artists → their top albums.
 * Used by prewarm-album-cache cron.
 */
export async function fetchGloballyTopAlbums(
  limit = 500,
  opts: { artistOffset?: number } = {},
): Promise<{
  name: string; artist: string; playcount?: number;
}[]> {
  const artistOffset = Math.max(0, opts.artistOffset ?? 0);
  const data = await lastfmFetch<{ artists?: { artist?: { name: string }[] } }>({
    method: 'chart.gettopartists',
    limit: '100',
  });
  const out: { name: string; artist: string; playcount?: number }[] = [];
  const artists = (data.artists?.artist ?? []).slice(artistOffset);
  for (const a of artists) {
    if (out.length >= limit) break;
    try {
      const tops = await fetchTopAlbumsForArtist(a.name, 5);
      for (const al of tops) {
        out.push({ name: al.name, artist: a.name, playcount: al.playcount });
        if (out.length >= limit) break;
      }
    } catch {
      continue;
    }
  }
  return out;
}
```

### 5.2. `_shared/musicbrainz.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_RATE_LIMIT_MS = 1100;  // strict 1 req/sec + buffer
const MB_CACHE_TTL_DAYS = 180;
let mbLastCallAt = 0;

async function mbThrottle() {
  const elapsed = Date.now() - mbLastCallAt;
  if (elapsed < MB_RATE_LIMIT_MS) await new Promise(r => setTimeout(r, MB_RATE_LIMIT_MS - elapsed));
  mbLastCallAt = Date.now();
}

export type MbReleaseGroup = {
  id: string;
  primary_type?: string;
  secondary_types?: string[];
  first_release_date?: string;
};

export async function getReleaseGroupCached(
  admin: SupabaseClient,
  artist: string,
  album: string,
): Promise<MbReleaseGroup | null> {
  const normalizedArtist = normalizeLookup(artist);
  const normalizedAlbum = normalizeLookup(album);

  const { data: cached } = await admin
    .from('musicbrainz_release_group_cache')
    .select('release_group_id, primary_type, secondary_types, first_release_date, fetched_at')
    .eq('normalized_artist', normalizedArtist)
    .eq('normalized_album', normalizedAlbum)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, MB_CACHE_TTL_DAYS)) {
    if (!cached.release_group_id) return null;
    return {
      id: cached.release_group_id,
      primary_type: cached.primary_type ?? undefined,
      secondary_types: cached.secondary_types ?? [],
      first_release_date: cached.first_release_date ?? undefined,
    };
  }

  const fresh = await fetchReleaseGroup(artist, album);
  await admin.from('musicbrainz_release_group_cache').upsert(
    {
      normalized_artist: normalizedArtist,
      normalized_album: normalizedAlbum,
      release_group_id: fresh?.id ?? null,
      primary_type: fresh?.primary_type ?? null,
      secondary_types: fresh?.secondary_types ?? [],
      first_release_date: fresh?.first_release_date ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'normalized_artist,normalized_album' },
  );

  return fresh;
}

async function fetchReleaseGroup(artist: string, album: string): Promise<MbReleaseGroup | null> {
  try {
    await mbThrottle();
    const q = `release:"${album.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
    const res = await fetch(`${MB_BASE}/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=1`, {
      headers: { 'User-Agent': Deno.env.get('MUSICBRAINZ_USER_AGENT') ?? 'AlbumOfTheDay/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { 'release-groups'?: any[] };
    const rg = data['release-groups']?.[0];
    if (!rg) return null;
    return {
      id: rg.id,
      primary_type: rg['primary-type'],
      secondary_types: rg['secondary-types'] ?? [],
      first_release_date: rg['first-release-date'],
    };
  } catch {
    return null;  // non-blocking
  }
}

const EXCLUDED_SECONDARY_TYPES = new Set(['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street']);

export function isAlbumLike(rg: MbReleaseGroup | null): boolean {
  if (!rg) return true;  // unknown → assume album-like
  if (rg.primary_type && rg.primary_type !== 'Album') return false;
  return !(rg.secondary_types ?? []).some(t => EXCLUDED_SECONDARY_TYPES.has(t));
}

function normalizeLookup(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}
```

### 5.3. `_shared/spotify-extended.ts`

```ts
const SPOTIFY_API = 'https://api.spotify.com/v1';

export type SpotifyAlbumSearchItem = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; height?: number; width?: number }[];
  release_date: string;
  total_tracks: number;
  album_type: string;
};

export type SpotifyAlbumDetails = SpotifyAlbumSearchItem & {
  duration_ms: number;
};

export type SpotifyAudioFeatures = {
  energy: number; valence: number; danceability: number;
  acousticness: number; instrumentalness: number; tempo: number;
};

export type SpotifyRelatedArtist = { id: string; name: string };

async function spotifyFetch(url: string, token: string, retryCount = 0): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 && retryCount < 3) {
    const retry = Number(res.headers.get('Retry-After') ?? '2');
    await new Promise(r => setTimeout(r, retry * 1000));
    return spotifyFetch(url, token, retryCount + 1);
  }
  return res;
}

/**
 * Album search by artist + album. Returns first 'album' type match.
 * This is the PRIMARY way we get spotify_id for Last.fm-discovered albums.
 */
export async function searchAlbum(token: string, artist: string, album: string, market = 'US'): Promise<SpotifyAlbumSearchItem | null> {
  const q = `album:"${album}" artist:"${artist}"`;
  const url = `${SPOTIFY_API}/search?type=album&limit=5&market=${market}&q=${encodeURIComponent(q)}`;
  const res = await spotifyFetch(url, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { albums?: { items?: SpotifyAlbumSearchItem[] } };
  const items = data.albums?.items ?? [];
  // Prefer title/artist matches and album_type='album'. Spotify search can
  // return wrong remixes/tributes for noisy Last.fm names, so reject weak hits.
  const normalizedAlbum = normalizeSearch(album);
  const normalizedArtist = normalizeSearch(artist);
  const strong = items.filter(i =>
    normalizeSearch(i.name).includes(normalizedAlbum) ||
    normalizedAlbum.includes(normalizeSearch(i.name)),
  ).filter(i =>
    i.artists.some(a => normalizeSearch(a.name) === normalizedArtist),
  );
  const pool = strong.length > 0 ? strong : items;
  return pool.find(i => i.album_type === 'album') ?? pool[0] ?? null;
}

/**
 * Non-restricted album details endpoint. Used sparingly for short albums
 * (3-5 tracks) to apply the ">= 20 minutes" quality rule without fetching
 * tracks for every candidate.
 */
export async function fetchAlbumDetails(token: string, albumId: string, market = 'US'): Promise<SpotifyAlbumDetails | null> {
  const res = await spotifyFetch(`${SPOTIFY_API}/albums/${albumId}?market=${market}`, token);
  if (!res.ok) return null;
  const data = (await res.json()) as SpotifyAlbumSearchItem & {
    tracks?: { items?: { duration_ms?: number }[] };
  };
  const duration_ms = (data.tracks?.items ?? []).reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  return { ...data, duration_ms };
}

/**
 * OPTIONAL — may return 403 for new Spotify apps (post-Nov 2024 restriction).
 * Algorithm handles null gracefully.
 */
export async function fetchRelatedArtistsOptional(
  token: string,
  spotifyArtistId: string,
): Promise<SpotifyRelatedArtist[] | null> {
  try {
    const res = await spotifyFetch(`${SPOTIFY_API}/artists/${spotifyArtistId}/related-artists`, token);
    if (res.status === 403) return null;  // endpoint restricted
    if (!res.ok) return null;
    const data = (await res.json()) as { artists?: SpotifyRelatedArtist[] };
    return data.artists ?? [];
  } catch {
    return null;
  }
}

/**
 * OPTIONAL — may return 403. Returns empty map on any failure.
 */
export async function fetchAudioFeaturesBatchOptional(
  token: string,
  trackIds: string[],
): Promise<Record<string, SpotifyAudioFeatures>> {
  const out: Record<string, SpotifyAudioFeatures> = {};
  if (trackIds.length === 0) return out;
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100);
    try {
      const res = await spotifyFetch(`${SPOTIFY_API}/audio-features?ids=${chunk.join(',')}`, token);
      if (res.status === 403) return {};  // endpoint restricted — bail entirely
      if (!res.ok) continue;
      const data = (await res.json()) as { audio_features?: (SpotifyAudioFeatures & { id: string } | null)[] };
      for (const f of data.audio_features ?? []) {
        if (f && f.id) out[f.id] = f;
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * OPTIONAL. Used as one source of tracks for tasteVector seed.
 * Requires user-top-read scope (which we already request in phase 2).
 */
export async function fetchUserTopTracksOptional(token: string, limit = 50): Promise<{ id: string; artists: { id: string; name: string }[] }[]> {
  try {
    const res = await spotifyFetch(`${SPOTIFY_API}/me/top/tracks?limit=${limit}&time_range=medium_term`, token);
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: { id: string; artists: { id: string; name: string }[] }[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Service-level (client_credentials) Spotify token for non-user-bound calls
 * (prewarm cache uses /search).
 */
export async function getServiceSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('missing_spotify_credentials');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`spotify_client_creds_failed:${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\b(remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
```

### 5.4. `_shared/external-cache.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSimilarArtists, type LastfmSimilarArtist } from './lastfm.ts';
import {
  fetchAudioFeaturesBatchOptional,
  fetchRelatedArtistsOptional,
  type SpotifyAudioFeatures,
  type SpotifyRelatedArtist,
} from './spotify-extended.ts';

const SIMILARITY_TTL_DAYS = 30;
const AUDIO_FEATURES_TTL_DAYS = 180;

function normalizeArtistName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Build the flexible source_artist_key:
 *   spotifyId present → 'spotify:abc123'
 *   else              → 'lastfm:normalized name'
 */
export function buildArtistKey(spotifyId: string | null | undefined, name: string): string {
  if (spotifyId) return `spotify:${spotifyId}`;
  return `lastfm:${normalizeArtistName(name)}`;
}

export async function getLastfmSimilarCached(
  admin: SupabaseClient,
  artistName: string,
  spotifyId?: string | null,
): Promise<LastfmSimilarArtist[]> {
  const key = buildArtistKey(spotifyId, artistName);
  const { data: cached } = await admin
    .from('artist_similarity_cache')
    .select('similar_artists, fetched_at')
    .eq('source', 'lastfm')
    .eq('source_artist_key', key)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, SIMILARITY_TTL_DAYS)) {
    return cached.similar_artists as LastfmSimilarArtist[];
  }

  // Last.fm is the primary signal. Do not silently convert failures to an
  // empty list, otherwise compute cannot distinguish "no candidates" from
  // "Last.fm is down/key is invalid".
  const fresh = await fetchSimilarArtists(artistName);
  await admin.from('artist_similarity_cache').upsert(
    {
      source: 'lastfm',
      source_artist_key: key,
      source_artist_name: artistName,
      similar_artists: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,source_artist_key' },
  );
  return fresh;
}

export async function getSpotifyRelatedCached(
  admin: SupabaseClient,
  spotifyToken: string,
  spotifyArtistId: string,
  artistName: string,
): Promise<SpotifyRelatedArtist[] | null> {
  const key = buildArtistKey(spotifyArtistId, artistName);
  const { data: cached } = await admin
    .from('artist_similarity_cache')
    .select('similar_artists, fetched_at')
    .eq('source', 'spotify')
    .eq('source_artist_key', key)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, SIMILARITY_TTL_DAYS)) {
    return cached.similar_artists as SpotifyRelatedArtist[];
  }

  const fresh = await fetchRelatedArtistsOptional(spotifyToken, spotifyArtistId);
  if (fresh === null) return null;  // endpoint restricted — don't poison cache with empty

  await admin.from('artist_similarity_cache').upsert(
    {
      source: 'spotify',
      source_artist_key: key,
      source_artist_name: artistName,
      similar_artists: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,source_artist_key' },
  );
  return fresh;
}

export async function getAudioFeaturesCached(
  admin: SupabaseClient,
  spotifyToken: string,
  trackIds: string[],
): Promise<Record<string, SpotifyAudioFeatures>> {
  if (trackIds.length === 0) return {};
  const { data: cached } = await admin
    .from('audio_features_cache')
    .select('spotify_track_id, features, fetched_at')
    .in('spotify_track_id', trackIds);

  const out: Record<string, SpotifyAudioFeatures> = {};
  const cachedIds = new Set<string>();
  for (const row of cached ?? []) {
    if (!isStale(row.fetched_at, AUDIO_FEATURES_TTL_DAYS)) {
      out[row.spotify_track_id] = row.features as SpotifyAudioFeatures;
      cachedIds.add(row.spotify_track_id);
    }
  }
  const missing = trackIds.filter(id => !cachedIds.has(id));
  if (missing.length === 0) return out;

  const fresh = await fetchAudioFeaturesBatchOptional(spotifyToken, missing);
  const rows: { spotify_track_id: string; features: SpotifyAudioFeatures; fetched_at: string }[] = [];
  for (const [id, f] of Object.entries(fresh)) {
    out[id] = f;
    rows.push({ spotify_track_id: id, features: f, fetched_at: new Date().toISOString() });
  }
  if (rows.length > 0) {
    await admin.from('audio_features_cache').upsert(rows, { onConflict: 'spotify_track_id' });
  }
  return out;
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}
```

### 5.5. `_shared/rng.ts`

```ts
/**
 * Tiny mulberry32 seeded RNG for deterministic tests.
 * Production code uses Math.random; tests pass makeRng(seed).
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

---

## 6. Чистая логика алгоритма

### 6.1. `_shared/taste-extraction.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserTopTracksOptional } from './spotify-extended.ts';
import { getAudioFeaturesCached } from './external-cache.ts';

export interface UserArtist {
  spotify_id: string | null;
  name: string;
  frequency: number;        // count of appearances in user_library
}

export interface TasteSignal {
  topArtists: UserArtist[];           // sorted desc by frequency, up to 50
  tasteVector: TasteVector | null;    // null if audio-features unavailable
  librarySize: number;
  libraryDecadeFractions: Record<string, number>;   // '1970': 0.05, '1980': 0.12, ...
}

export interface TasteVector {
  energy: number; valence: number; danceability: number;
  acousticness: number; instrumentalness: number; tempo: number;
}

export async function extractTasteSignal(
  admin: SupabaseClient,
  userId: string,
  spotifyToken: string,
): Promise<TasteSignal> {
  // 1) Aggregate top artists from user_library. Prefer Spotify ID when present
  //    (handles name collisions like "Madonna").
  const { data: lib } = await admin.from('user_library')
    .select('artist_name, primary_artist_spotify_id, release_year')
    .eq('user_id', userId)
    .is('removed_at', null);

  type ArtistAgg = { spotify_id: string | null; name: string; frequency: number };
  const byKey = new Map<string, ArtistAgg>();
  for (const row of lib ?? []) {
    const id: string | null = row.primary_artist_spotify_id ?? null;
    const key = id ?? row.artist_name.toLowerCase().trim();
    const existing = byKey.get(key);
    if (existing) {
      existing.frequency += 1;
    } else {
      byKey.set(key, { spotify_id: id, name: row.artist_name, frequency: 1 });
    }
  }
  const topArtists = [...byKey.values()]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 50);

  // 2) Library decade composition (for release_balance signal).
  const decadeCounts: Record<string, number> = {};
  let totalWithYear = 0;
  for (const row of lib ?? []) {
    if (row.release_year && Number.isFinite(row.release_year)) {
      const decade = String(Math.floor(row.release_year / 10) * 10);
      decadeCounts[decade] = (decadeCounts[decade] ?? 0) + 1;
      totalWithYear += 1;
    }
  }
  const libraryDecadeFractions: Record<string, number> = {};
  if (totalWithYear > 0) {
    for (const [decade, count] of Object.entries(decadeCounts)) {
      libraryDecadeFractions[decade] = count / totalWithYear;
    }
  }

  // 3) Taste vector — OPTIONAL. Only available if /me/top/tracks AND
  //    /audio-features both work (post-Nov 2024 some apps lose audio-features).
  let tasteVector: TasteVector | null = null;
  const topTracks = await fetchUserTopTracksOptional(spotifyToken, 50);
  if (topTracks.length >= 10) {
    const trackIds = topTracks.map(t => t.id);
    const featuresMap = await getAudioFeaturesCached(admin, spotifyToken, trackIds);
    const available = Object.values(featuresMap);
    if (available.length >= 10) {
      tasteVector = averageFeatures(available);
    }
  }

  return {
    topArtists,
    tasteVector,
    librarySize: lib?.length ?? 0,
    libraryDecadeFractions,
  };
}

function averageFeatures(arr: TasteVector[]): TasteVector {
  const n = arr.length;
  const sum = arr.reduce((a, f) => ({
    energy: a.energy + f.energy,
    valence: a.valence + f.valence,
    danceability: a.danceability + f.danceability,
    acousticness: a.acousticness + f.acousticness,
    instrumentalness: a.instrumentalness + f.instrumentalness,
    tempo: a.tempo + f.tempo,
  }), { energy: 0, valence: 0, danceability: 0, acousticness: 0, instrumentalness: 0, tempo: 0 });
  return {
    energy: sum.energy / n,
    valence: sum.valence / n,
    danceability: sum.danceability / n,
    acousticness: sum.acousticness / n,
    instrumentalness: sum.instrumentalness / n,
    tempo: sum.tempo / n,
  };
}
```

### 6.2. `_shared/candidate-generation.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAlbumInfo, fetchTopAlbumsForArtist } from './lastfm.ts';
import { fetchAlbumDetails, searchAlbum } from './spotify-extended.ts';
import { getReleaseGroupCached, isAlbumLike } from './musicbrainz.ts';
import { getLastfmSimilarCached, getSpotifyRelatedCached } from './external-cache.ts';
import type { TasteSignal, UserArtist } from './taste-extraction.ts';

export interface AlbumCandidate {
  spotify_id: string;
  mb_release_group_id?: string;
  title: string;
  primary_artist_name: string;
  primary_artist_spotify_id?: string;
  cover_url?: string;
  total_tracks: number;
  duration_ms?: number;
  release_year?: number;
  album_type?: string;
  lastfm_listeners?: number;
  lastfm_playcount?: number;
  // signals
  best_similarity_match: number;     // [0..1], max across source paths
  source_paths: { source_artist: UserArtist; similar_match: number }[];
}

interface GenerateOpts {
  maxSourceArtists?: number;          // top-N artists from library to use as seed
  maxSimilarPerSource?: number;       // up to N similar per source artist
  maxAlbumsPerSimilar?: number;       // up to N top albums per similar artist
  maxCandidates?: number;
  maxMusicBrainzLookups?: number;     // cap slow 1 req/sec lookups on cold cache
  market?: string;
}

const DEFAULTS: Required<GenerateOpts> = {
  maxSourceArtists: 15,
  maxSimilarPerSource: 8,
  maxAlbumsPerSimilar: 2,
  maxCandidates: 250,
  maxMusicBrainzLookups: 40,
  market: 'US',
};

export async function generateCandidates(
  admin: SupabaseClient,
  spotifyToken: string,
  taste: TasteSignal,
  exclusions: {
    spotifyAlbumIds: Set<string>;
    releaseGroupIds: Set<string>;
    normalizedAlbumKeys: Set<string>;
  },
  recentArtistsToAvoid: Set<string>,   // artist diversity guard (last 30d picks)
  opts: GenerateOpts = {},
): Promise<{ candidates: AlbumCandidate[]; spotifyRelatedAvailable: boolean }> {
  const o = { ...DEFAULTS, ...opts };
  const sourceArtists = taste.topArtists.slice(0, o.maxSourceArtists);

  // Track whether Spotify related-artists endpoint is available — informs
  // selection_reason later (and helps debug).
  let spotifyRelatedAvailable = false;

  // Aggregate map of similar-artist-name → max match from any source artist.
  type SimilarHit = {
    name: string;
    spotify_id?: string;
    best_match: number;
    source_paths: { source_artist: UserArtist; similar_match: number }[];
  };
  const similarMap = new Map<string, SimilarHit>();  // key = lowercased name

  for (const src of sourceArtists) {
    // 1) Last.fm getSimilar (PRIMARY).
    const lfmSim = await getLastfmSimilarCached(admin, src.name, src.spotify_id);
    for (const s of lfmSim.slice(0, o.maxSimilarPerSource)) {
      mergeSimilar(similarMap, src, s.name, undefined, s.match);
    }
    // 2) Spotify related-artists (OPTIONAL bonus).
    if (src.spotify_id) {
      const spRel = await getSpotifyRelatedCached(admin, spotifyToken, src.spotify_id, src.name);
      if (spRel) {
        spotifyRelatedAvailable = true;
        for (const s of spRel.slice(0, o.maxSimilarPerSource)) {
          // Spotify doesn't return a match score; treat as 0.4 default.
          mergeSimilar(similarMap, src, s.name, s.id, 0.4);
        }
      }
    }
  }

  // Now for each similar artist, fetch their top albums via Last.fm,
  // then resolve metadata via Spotify search.
  const candidates: AlbumCandidate[] = [];
  const seenSpotifyIds = new Set<string>(exclusions.spotifyAlbumIds);

  for (const sim of similarMap.values()) {
    if (candidates.length >= o.maxCandidates) break;
    // Artist diversity guard.
    const simNameLower = sim.name.toLowerCase().trim();
    if ([...recentArtistsToAvoid].some(a => a.toLowerCase().trim() === simNameLower)) continue;

    let topAlbums;
    try {
      topAlbums = await fetchTopAlbumsForArtist(sim.name, o.maxAlbumsPerSimilar);
    } catch {
      continue;
    }
    for (const ta of topAlbums) {
      if (candidates.length >= o.maxCandidates) break;
      if (exclusions.normalizedAlbumKeys.has(normalizeAlbumKey(sim.name, ta.name))) continue;
      const sp = await searchAlbum(spotifyToken, sim.name, ta.name, o.market);
      if (!sp) continue;
      if (seenSpotifyIds.has(sp.id)) continue;
      if (sp.album_type !== 'album') continue;
      const primaryArtistName = sp.artists[0]?.name ?? sim.name;
      if (exclusions.normalizedAlbumKeys.has(normalizeAlbumKey(primaryArtistName, sp.name))) continue;

      let durationMs: number | undefined;
      if (sp.total_tracks < 6) {
        // Keep short-but-real albums (e.g. long jazz/ambient records) only if
        // they clear the 20 minute rule. Skip obvious singles/EPs cheaply.
        if (sp.total_tracks < 3) continue;
        const details = await fetchAlbumDetails(spotifyToken, sp.id, o.market);
        durationMs = details?.duration_ms;
        if (!durationMs || durationMs < 20 * 60 * 1000) continue;
      }
      seenSpotifyIds.add(sp.id);

      const info = await fetchAlbumInfo(sp.artists[0]?.name ?? sim.name, sp.name);

      candidates.push({
        spotify_id: sp.id,
        title: sp.name,
        primary_artist_name: primaryArtistName,
        primary_artist_spotify_id: sp.artists[0]?.id,
        cover_url: sp.images[0]?.url,
        total_tracks: sp.total_tracks,
        duration_ms: durationMs,
        release_year: parseYear(sp.release_date),
        album_type: sp.album_type,
        best_similarity_match: sim.best_match,
        source_paths: sim.source_paths.slice(),
        lastfm_listeners: info?.listeners,
        lastfm_playcount: info?.playcount ?? ta.playcount,
      });
    }
  }

  // MusicBrainz dedup + compilation filter. Lookup is cache-first and only
  // runs after the cheap Spotify/Last.fm filters have already reduced the pool.
  const filtered: AlbumCandidate[] = [];
  const seenReleaseGroups = new Set<string>(exclusions.releaseGroupIds);
  for (const [idx, c] of candidates.entries()) {
    const rg = idx < o.maxMusicBrainzLookups
      ? await getReleaseGroupCached(admin, c.primary_artist_name, c.title)
      : null;
    if (rg && !isAlbumLike(rg)) continue;
    if (rg?.id) {
      if (seenReleaseGroups.has(rg.id)) continue;
      seenReleaseGroups.add(rg.id);
      c.mb_release_group_id = rg.id;
    }
    filtered.push(c);
  }

  return { candidates: filtered, spotifyRelatedAvailable };
}

function mergeSimilar(
  map: Map<string, { name: string; spotify_id?: string; best_match: number; source_paths: any[] }>,
  source: UserArtist,
  name: string,
  spotifyId: string | undefined,
  match: number,
) {
  const key = name.toLowerCase().trim();
  const existing = map.get(key);
  if (existing) {
    if (match > existing.best_match) existing.best_match = match;
    if (spotifyId && !existing.spotify_id) existing.spotify_id = spotifyId;
    if (!existing.source_paths.some((p: any) => p.source_artist.name === source.name)) {
      existing.source_paths.push({ source_artist: source, similar_match: match });
    }
  } else {
    map.set(key, {
      name,
      spotify_id: spotifyId,
      best_match: match,
      source_paths: [{ source_artist: source, similar_match: match }],
    });
  }
}

function parseYear(d: string): number | undefined {
  const y = Number.parseInt(d?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) ? y : undefined;
}
```

### 6.3. `_shared/recommendation-algorithm.ts` (PURE, RNG injectable)

```ts
import type { AlbumCandidate } from './candidate-generation.ts';
import type { TasteSignal } from './taste-extraction.ts';

export const ALGORITHM_VERSION = 1;

export interface ScoringWeights {
  artist_similarity: number;
  source_artist_frequency: number;
  popularity_log_percentile: number;
  release_balance: number;
  sampling_temperature: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  artist_similarity: 0.45,
  source_artist_frequency: 0.20,
  popularity_log_percentile: 0.20,
  release_balance: 0.05,
  sampling_temperature: 0.10,
};

export interface ScoredCandidate {
  candidate: AlbumCandidate;
  score: number;
  breakdown: {
    similarity: number;
    source_freq: number;
    popularity: number;
    balance: number;
    temperature: number;
  };
}

export function scoreCandidates(
  candidates: AlbumCandidate[],
  taste: TasteSignal,
  rng: () => number = Math.random,
  weights = DEFAULT_WEIGHTS,
): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  // 1) popularity_log_percentile: rank within pool by log(metric + 1),
  // where metric = Last.fm listeners when available, otherwise playcount.
  const popularityMetrics = candidates.map(c => c.lastfm_listeners ?? c.lastfm_playcount ?? 0);
  const logPopularity = popularityMetrics.map(v => Math.log(v + 1));
  const sortedLog = [...logPopularity].sort((a, b) => a - b);
  const popularityPercentile = (v: number) => {
    if (sortedLog.length === 0) return 0;
    let idx = sortedLog.findIndex(x => x >= v);
    if (idx < 0) idx = sortedLog.length - 1;
    return idx / Math.max(1, sortedLog.length - 1);
  };

  // 2) source_artist_frequency: sum of source-artist frequencies for this candidate,
  //    log-normalized within pool.
  const candFreq = candidates.map(c =>
    c.source_paths.reduce((s, p) => s + Math.log(p.source_artist.frequency + 1), 0)
  );
  const maxFreq = Math.max(1, ...candFreq);

  return candidates.map((c, i) => {
    const similarity = clamp01(c.best_similarity_match);
    const source_freq = candFreq[i] / maxFreq;
    const popularity = popularityPercentile(logPopularity[i]);
    const balance = releaseBalanceScore(c, taste);
    const temperature = rng();

    const score =
      weights.artist_similarity * similarity +
      weights.source_artist_frequency * source_freq +
      weights.popularity_log_percentile * popularity +
      weights.release_balance * balance +
      weights.sampling_temperature * temperature;

    return {
      candidate: c,
      score,
      breakdown: { similarity, source_freq, popularity, balance, temperature },
    };
  }).sort((a, b) => b.score - a.score);
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function releaseBalanceScore(c: AlbumCandidate, taste: TasteSignal): number {
  if (!c.release_year) return 0.5;
  const decade = String(Math.floor(c.release_year / 10) * 10);
  const libFraction = taste.libraryDecadeFractions[decade] ?? 0;
  // Underrepresented decades get higher score. Cap at 1.
  return clamp01(1 - libFraction);
}

export function selectFromTop(
  scored: ScoredCandidate[],
  rng: () => number = Math.random,
  topN = 20,
): ScoredCandidate | null {
  if (scored.length === 0) return null;
  const top = scored.slice(0, Math.min(topN, scored.length));
  const total = top.reduce((s, x) => s + Math.max(0, x.score), 0);
  if (total <= 0) return top[Math.floor(rng() * top.length)];
  let r = rng() * total;
  for (const item of top) {
    r -= Math.max(0, item.score);
    if (r <= 0) return item;
  }
  return top[top.length - 1];
}

export function buildSelectionReason(
  chosen: ScoredCandidate,
  taste: TasteSignal,
  spotifyRelatedAvailable: boolean,
  isFallback = false,
  fallbackReason: string | null = null,
): Record<string, unknown> {
  if (isFallback) {
    return {
      is_fallback: true,
      fallback_reason: fallbackReason,
      message: "Today's a special pick — your usual flow returns tomorrow.",
    };
  }
  const sortedPaths = chosen.candidate.source_paths
    .slice()
    .sort((a, b) => b.source_artist.frequency - a.source_artist.frequency);
  const primaryPath = sortedPaths[0];
  return {
    is_fallback: false,
    primary_source_artist: primaryPath?.source_artist.name ?? null,
    secondary_source_artists: sortedPaths
      .slice(1, 4)
      .map(p => p.source_artist.name),
    similar_artists_path: [chosen.candidate.primary_artist_name],
    lastfm_listeners: chosen.candidate.lastfm_listeners ?? null,
    lastfm_playcount: chosen.candidate.lastfm_playcount ?? null,
    decade: chosen.candidate.release_year
      ? `${Math.floor(chosen.candidate.release_year / 10) * 10}s`
      : null,
    spotify_related_used: spotifyRelatedAvailable,
    audio_match_used: false,
    score_breakdown: chosen.breakdown,
  };
}
```

### 6.4. `_shared/curated-fallback.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Curated fallback: pull random globally-acclaimed album from pre-warmed cache
 * that the user hasn't already heard.
 */
export async function getCuratedFallback(
  admin: SupabaseClient,
  userId: string,
): Promise<{ album_id: string } | null> {
  // Final implementation builds four exclusion sets before selecting:
  // 1) exact Spotify album IDs from user_library + recommendation_history
  // 2) exact internal album IDs from recommendation_history
  // 3) MusicBrainz release-group IDs from library/history
  // 4) normalized artist+album keys from library/history
  // This prevents Spotify remasters/deluxe editions from bypassing fallback dedup.
  const { data: lib } = await admin.from('user_library')
    .select('provider_album_id, mb_release_group_id, album_name, artist_name')
    .eq('user_id', userId)
    .is('removed_at', null);
  const libSpotifyIds = new Set((lib ?? []).map(r => r.provider_album_id).filter(Boolean));

  const { data: history } = await admin.from('recommendation_history')
    .select('album_id, album:albums(spotify_id, mb_release_group_id, primary_artist_name, title)')
    .eq('user_id', userId);
  const usedAlbumIds = new Set((history ?? []).map(r => r.album_id));

  const { data: candidates } = await admin.from('albums')
    .select('id, spotify_id, mb_release_group_id, title, lastfm_listeners, lastfm_playcount, primary_artist_name')
    .eq('is_prewarm_seed', true)
    .order('lastfm_listeners', { ascending: false, nullsFirst: false })
    .order('lastfm_playcount', { ascending: false, nullsFirst: false })
    .limit(300);

  // Also avoid same-artist repeats from last 30 days.
  const { data: recentPicks } = await admin
    .from('albums_of_the_day')
    .select('album:albums(primary_artist_name)')
    .eq('user_id', userId)
    .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const recentArtists = new Set(
    (recentPicks ?? [])
      .map((r: any) => r.album?.primary_artist_name?.toLowerCase().trim())
      .filter(Boolean),
  );

  const eligible = (candidates ?? []).filter(c =>
    !libSpotifyIds.has(c.spotify_id) &&
    !usedAlbumIds.has(c.id) &&
    // Also exclude release groups and normalized artist+album keys in the final code.
    !recentArtists.has(c.primary_artist_name.toLowerCase().trim()),
  );

  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return { album_id: pick.id };
}
```

---

## 7. Edge Functions (3 шт + day-1 trigger)

### 7.1. `compute-album-of-the-day/index.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { getValidSpotifyToken } from '../_shared/spotify.ts';
import { extractTasteSignal } from '../_shared/taste-extraction.ts';
import { generateCandidates, type AlbumCandidate } from '../_shared/candidate-generation.ts';
import {
  scoreCandidates, selectFromTop, buildSelectionReason, ALGORITHM_VERSION,
} from '../_shared/recommendation-algorithm.ts';
import { getCuratedFallback } from '../_shared/curated-fallback.ts';

type FallbackReason =
  | 'no_candidates'
  | 'spotify_search_failed'
  | 'spotify_audio_unavailable'
  | 'lastfm_unavailable'
  | 'mb_timeout'
  | 'library_too_small'
  | 'compute_timeout'
  | 'unknown_error';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  let payload: { user_id?: string; target_date?: string; user_timezone?: string };
  try { payload = await req.json(); }
  catch { return jsonError(400, 'invalid_json_body'); }

  const userId = payload.user_id;
  if (!userId) return jsonError(400, 'missing_user_id');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Resolve target_date and user_timezone server-side if missing.
  let targetDate = payload.target_date;
  let userTz = payload.user_timezone ?? 'UTC';
  if (!targetDate) {
    const { data: ctx, error: ctxErr } = await admin
      .rpc('resolve_user_compute_context', { p_user_id: userId });
    if (ctxErr) return jsonError(500, 'context_resolve_failed', ctxErr.message);
    const row = Array.isArray(ctx) ? ctx[0] : ctx;
    targetDate = row?.target_date;
    userTz = row?.user_tz ?? 'UTC';
    if (!targetDate) return jsonError(400, 'profile_not_found');
  }

  // Idempotency.
  const { data: existing } = await admin.from('albums_of_the_day')
    .select('id').eq('user_id', userId).eq('date', targetDate).maybeSingle();
  if (existing) {
    return jsonResponse({ ok: true, status: 'already_exists', aotd_id: existing.id });
  }

  // Compute primary path. On any fatal error → curated fallback.
  let albumId: string | null = null;
  let selectionReason: Record<string, unknown> = {};
  let isFallback = false;
  let fallbackReason: FallbackReason | null = null;

  try {
    const spotifyToken = await getValidSpotifyToken(admin, userId);
    const taste = await extractTasteSignal(admin, userId, spotifyToken);
    if (taste.topArtists.length < 5) {
      fallbackReason = 'library_too_small';
      throw new Error('library_too_small');
    }

    // Build exclusion sets.
    const { data: lib } = await admin.from('user_library')
      .select('provider_album_id, mb_release_group_id, album_name, artist_name')
      .eq('user_id', userId)
      .is('removed_at', null);

    const { data: hist } = await admin
      .from('recommendation_history')
      .select('album:albums(spotify_id, mb_release_group_id, primary_artist_name, title)')
      .eq('user_id', userId);

    // Artist diversity: recent 30d picks.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: recentPicks } = await admin
      .from('albums_of_the_day')
      .select('album:albums(primary_artist_name)')
      .eq('user_id', userId).gte('date', since);
    const recentArtists = new Set(
      (recentPicks ?? [])
        .map((r: any) => r.album?.primary_artist_name)
        .filter(Boolean),
    );

    const exclusions = buildCandidateExclusions(lib ?? [], hist ?? []);

    const { candidates, spotifyRelatedAvailable } = await generateCandidates(
      admin, spotifyToken, taste, exclusions, recentArtists,
    );

    if (candidates.length === 0) {
      fallbackReason = 'no_candidates';
      throw new Error('no_candidates');
    }

    const scored = scoreCandidates(candidates, taste);
    const chosen = selectFromTop(scored);
    if (!chosen) {
      fallbackReason = 'no_candidates';
      throw new Error('selection_empty');
    }

    // Upsert into albums.
    const { data: albumRow, error: albumErr } = await admin.from('albums').upsert({
      spotify_id: chosen.candidate.spotify_id,
      mb_release_group_id: chosen.candidate.mb_release_group_id ?? null,
      title: chosen.candidate.title,
      primary_artist_name: chosen.candidate.primary_artist_name,
      primary_artist_spotify_id: chosen.candidate.primary_artist_spotify_id ?? null,
      release_year: chosen.candidate.release_year ?? null,
      cover_url: chosen.candidate.cover_url ?? null,
      total_tracks: chosen.candidate.total_tracks,
      duration_ms: chosen.candidate.duration_ms ?? null,
      album_type: chosen.candidate.album_type ?? null,
      lastfm_listeners: chosen.candidate.lastfm_listeners ?? null,
      lastfm_playcount: chosen.candidate.lastfm_playcount ?? null,
      metadata_updated_at: new Date().toISOString(),
    }, { onConflict: 'spotify_id' }).select('id').single();

    if (albumErr || !albumRow) {
      fallbackReason = 'unknown_error';
      throw new Error(`album_upsert_failed:${albumErr?.message}`);
    }

    albumId = albumRow.id;
    selectionReason = buildSelectionReason(chosen, taste, spotifyRelatedAvailable);
  } catch (e) {
    console.warn(`[compute] primary failed for ${userId}: ${e instanceof Error ? e.message : e}`);
    isFallback = true;
    if (!fallbackReason) {
      const msg = e instanceof Error ? e.message : String(e);
      fallbackReason = msg.includes('lastfm') || msg.includes('missing_lastfm')
        ? 'lastfm_unavailable'
        : 'unknown_error';
    }
    const fb = await getCuratedFallback(admin, userId);
    if (!fb) {
      return jsonError(500, 'no_album_available', String(e));
    }
    albumId = fb.album_id;
    selectionReason = buildSelectionReason(
      { candidate: {} as AlbumCandidate, score: 0, breakdown: {} as any },
      { topArtists: [], tasteVector: null, librarySize: 0, libraryDecadeFractions: {} },
      false, true, fallbackReason,
    );
  }

  if (!albumId) return jsonError(500, 'no_album_id');

  const { data: ensured, error: ensureErr } = await admin
    .rpc('ensure_recommendation_atomic', {
      p_user_id: userId,
      p_album_id: albumId,
      p_date: targetDate,
      p_algorithm_version: ALGORITHM_VERSION,
      p_selection_reason: selectionReason,
      p_is_fallback: isFallback,
      p_fallback_reason: fallbackReason,
      p_user_timezone: userTz,
    });

  if (ensureErr) return jsonError(500, 'aotd_insert_failed', ensureErr.message);
  const ensuredRow = Array.isArray(ensured) ? ensured[0] : ensured;

  return jsonResponse({
    ok: true,
    status: ensuredRow?.created ? 'created' : 'already_exists',
    aotd_id: ensuredRow?.aotd_id,
    is_fallback: isFallback,
    fallback_reason: fallbackReason,
  });
});
```

### 7.2. `dispatch-daily-picks/index.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import { jsonError, jsonResponse } from '../_shared/cors.ts';

const CONCURRENCY = 5;

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: due, error } = await admin.rpc('find_users_due_for_compute', { p_lead_minutes: 60 });
  if (error) return jsonError(500, 'rpc_failed', error.message);
  if (!due || due.length === 0) {
    return jsonResponse({ ok: true, dispatched: 0 });
  }

  let dispatched = 0;
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const batch = due.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (u: any) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/compute-album-of-the-day`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: u.user_id,
            target_date: u.target_date,
            user_timezone: u.user_tz,
          }),
        });
        if (res.ok) dispatched += 1;
        else console.warn(`[dispatch] compute failed for ${u.user_id}: ${res.status}`);
      } catch (e) {
        console.warn(`[dispatch] error for ${u.user_id}: ${e instanceof Error ? e.message : e}`);
      }
    }));
  }

  return jsonResponse({ ok: true, dispatched, total_due: due.length });
});
```

### 7.3. `prewarm-album-cache/index.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import { jsonError, jsonResponse } from '../_shared/cors.ts';
import { fetchGloballyTopAlbums } from '../_shared/lastfm.ts';
import { getServiceSpotifyToken, searchAlbum } from '../_shared/spotify-extended.ts';

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return jsonError(401, 'unauthorized');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonError(500, 'missing_supabase_env');
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const limit = parseLimit(req.url); // default 80, max 120
    const topAlbums = await fetchGloballyTopAlbums(limit);
    const spotifyToken = await getServiceSpotifyToken();
    const seeds = mergeBootstrapSeeds(topAlbums);

    let inserted = 0;
    for (const item of seeds.slice(0, limit + BOOTSTRAP_FALLBACK_SEEDS.length)) {
      await new Promise(r => setTimeout(r, 100));  // throttle Spotify ~10 req/sec
      const sp = await searchAlbum(spotifyToken, item.artist, item.name).catch(() => null);
      if (!sp) continue;

      const { error } = await admin.from('albums').upsert({
        spotify_id: sp.id,
        title: sp.name,
        primary_artist_name: sp.artists[0]?.name ?? item.artist,
        primary_artist_spotify_id: sp.artists[0]?.id ?? null,
        release_year: parseYear(sp.release_date),
        cover_url: sp.images[0]?.url ?? null,
        total_tracks: sp.total_tracks,
        album_type: sp.album_type,
        lastfm_playcount: item.playcount ?? null,
        is_prewarm_seed: true,
        metadata_updated_at: new Date().toISOString(),
      }, { onConflict: 'spotify_id' });

      if (!error) inserted += 1;
    }

    return jsonResponse({ ok: true, fetched: topAlbums.length, attempted: seeds.length, inserted });
  } catch (e) {
    return jsonError(500, 'prewarm_failed', e instanceof Error ? e.message : String(e));
  }
});

function parseYear(d: string) { const y = Number(d?.slice(0, 4)); return Number.isFinite(y) ? y : null; }

const BOOTSTRAP_FALLBACK_SEEDS = [
  { artist: 'The Beatles', name: 'Abbey Road' },
  { artist: 'Miles Davis', name: 'Kind of Blue' },
  { artist: 'Joni Mitchell', name: 'Blue' },
  { artist: 'Radiohead', name: 'OK Computer' },
  { artist: 'Stevie Wonder', name: 'Songs in the Key of Life' },
  { artist: 'Nirvana', name: 'Nevermind' },
  { artist: 'Kendrick Lamar', name: 'To Pimp a Butterfly' },
  { artist: 'Kate Bush', name: 'Hounds of Love' },
  { artist: 'David Bowie', name: 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars' },
  { artist: 'Aphex Twin', name: 'Selected Ambient Works 85-92' },
];

function mergeBootstrapSeeds(topAlbums: { artist: string; name: string; playcount?: number }[]) {
  const seen = new Set<string>();
  const out: { artist: string; name: string; playcount?: number }[] = [];
  for (const item of [...BOOTSTRAP_FALLBACK_SEEDS, ...topAlbums]) {
    const key = `${item.artist.toLowerCase()}::${item.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
```

### 7.4. Day-1 trigger из `sync-spotify-library`

Добавляется в `runSync` после успешного `patchSyncStatus({ status: 'completed', ... })`:

```ts
// Day-1 compute trigger — fire-and-forget. If pick for today already exists,
// the compute function no-ops. Idempotent and safe.
try {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (cronSecret && supabaseUrl) {
    EdgeRuntime.waitUntil((async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/compute-album-of-the-day`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
          // user_timezone and target_date resolved server-side from profiles.
          body: JSON.stringify({ user_id: userId }),
        });
      } catch (e) {
        console.warn('[day-1-compute] trigger failed', e instanceof Error ? e.message : e);
      }
    })());
  }
} catch {
  // Non-blocking: failure here doesn't break sync completion.
}
```

Также обновить `sync-spotify-library` чтобы заполнять новые поля `user_library`:

```ts
// в aggregateLibrary → AggregatedAlbum типе:
artist_ids: { id: string; name: string }[];  // полный список из Spotify
// при INSERT в user_library:
primary_artist_spotify_id: a.artist_ids[0]?.id ?? null,
artist_ids: a.artist_ids.length > 0 ? a.artist_ids : null,
```

### 7.5. Обновление `upsert-streaming-connection`

Сначала обновить OAuth scopes в `lib/auth.ts`:

```ts
export const SPOTIFY_SCOPES = ['user-library-read', 'user-top-read', 'user-read-private'] as const;
```

`user-read-private` нужен не для алгоритма, а для `/me.product` (Spotify Free/Premium explainer) и будущего `/me.country`; Spotify docs explicitly gate these fields behind that scope.

Existing beta/dev users who connected before this scope was added may need to reconnect Spotify once for `spotify_product` to populate. Algorithm compute must not depend on this field.

После `fetchSpotifyProfile`:

```ts
// /me возвращает product: 'premium' | 'free' | 'open'
spotify_product: spotifyProfile.product ?? null,
```

И расширить тип `SpotifyProfile` в `_shared/spotify.ts`:
```ts
export type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  images?: SpotifyImage[];
  product?: 'premium' | 'free' | 'open';
};
```

---

## 8. pg_cron setup

В SQL editor Supabase Dashboard:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- В Settings → Vault создать secrets вручную:
--   cron_secret = тот же что в Edge Function secrets
--   project_url = https://<project-ref>.supabase.co

-- Hourly dispatch.
select cron.schedule(
  'dispatch-daily-picks',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/dispatch-daily-picks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Nightly pre-warm at 03:00 UTC.
select cron.schedule(
  'prewarm-album-cache',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/prewarm-album-cache',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify:
select * from cron.job;
```

**Дебаг команды:**
```sql
select * from cron.job_run_details order by start_time desc limit 20;
select cron.unschedule('dispatch-daily-picks');  -- если нужно отключить
```

---

## 9. Клиентский слой

### 9.1. `lib/recommendation.ts`

```ts
export interface SelectionReasonV1 {
  is_fallback: boolean;
  primary_source_artist?: string | null;
  secondary_source_artists?: string[];
  decade?: string | null;
  lastfm_listeners?: number | null;
  lastfm_playcount?: number | null;
  spotify_related_used?: boolean;
  audio_match_used?: boolean;
  message?: string;
  fallback_reason?: string;
}

export function formatSelectionReason(r: SelectionReasonV1): string {
  if (r.is_fallback) {
    return r.message ?? "Today's a special pick — your usual flow returns tomorrow.";
  }
  const primary = r.primary_source_artist;
  const secondary = r.secondary_source_artists ?? [];
  if (!primary) return 'Based on your library. We hope you like it.';
  if (secondary.length === 0) {
    return `Picked because you've been saving stuff by ${primary} and similar artists.`;
  }
  const list = [primary, ...secondary.slice(0, 1)].join(', ');
  return `Picked because you've been saving stuff by ${list} and similar artists. We hope you like it.`;
}

export type TodayPick = {
  aotd_id: string;
  pick_date: string;
  status: 'pending' | 'opened' | 'rated';
  is_fallback: boolean;
  fallback_reason: string | null;
  selection_reason: SelectionReasonV1;
  opened_at: string | null;
  album_id: string;
  album_title: string;
  album_primary_artist_name: string;
  album_cover_url: string | null;
  album_spotify_id: string;
  album_release_year: number | null;
  album_total_tracks: number | null;
  album_duration_ms: number | null;
};
```

### 9.2. `lib/hooks/useTodayPick.ts`

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { TodayPick } from '@/lib/recommendation';

const TODAY_KEY = (userId?: string) => ['today-pick', userId];

export function useTodayPick() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: TODAY_KEY(userId),
    enabled: !!userId,
    queryFn: async (): Promise<TodayPick | null> => {
      if (!userId) throw new Error('missing_user_id');
      // RPC resolves "today" in user's timezone server-side.
      const { data, error } = await supabase.rpc('get_current_pick', { p_user_id: userId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as TodayPick | null;
    },
  });

  // Realtime: any INSERT/UPDATE on albums_of_the_day for this user → invalidate.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`today-pick-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: TODAY_KEY(userId) });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc, instanceId]);

  return query;
}
```

### 9.3. `app/(tabs)/index.tsx`

```tsx
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TodayCard } from '@/components/home/TodayCard';
import { WaitingForPick } from '@/components/home/WaitingForPick';
import { useTodayPick } from '@/lib/hooks/useTodayPick';

export default function HomeScreen() {
  const { data: pick, isLoading } = useTodayPick();
  return (
    <Screen>
      <Text variant="h1">Today</Text>
      {isLoading ? null : pick ? <TodayCard pick={pick} /> : <WaitingForPick />}
    </Screen>
  );
}
```

`TodayCard` и `WaitingForPick` — placeholder-уровень. Финальный дизайн в фазе 5.

---

## 10. Тестирование

### 10.1. Deterministic unit-тесты для recommendation-algorithm.ts

`tests/algorithm-fixtures.ts` — 3 golden профиля:

```ts
import type { TasteSignal } from '../supabase/functions/_shared/taste-extraction.ts';
import type { AlbumCandidate } from '../supabase/functions/_shared/candidate-generation.ts';

export const mainstreamTaste: TasteSignal = {
  librarySize: 500,
  topArtists: [
    { spotify_id: 'a1', name: 'Drake', frequency: 25 },
    { spotify_id: 'a2', name: 'Taylor Swift', frequency: 20 },
    { spotify_id: 'a3', name: 'Kendrick Lamar', frequency: 18 },
    // ... + 17 more
  ],
  tasteVector: { energy: 0.7, valence: 0.6, danceability: 0.65, acousticness: 0.2, instrumentalness: 0.05, tempo: 110 },
  libraryDecadeFractions: { '2010': 0.35, '2020': 0.45, '2000': 0.15, '1990': 0.05 },
};

export const undergroundTaste: TasteSignal = {
  librarySize: 800,
  topArtists: [
    { spotify_id: 'd1', name: 'Burzum', frequency: 12 },     // dungeon synth adjacent
    { spotify_id: 'd2', name: 'Aphex Twin', frequency: 30 },
    { spotify_id: 'd3', name: 'Autechre', frequency: 25 },
    // ... underground electronic / experimental
  ],
  tasteVector: { energy: 0.4, valence: 0.3, danceability: 0.4, acousticness: 0.3, instrumentalness: 0.6, tempo: 95 },
  libraryDecadeFractions: { '1990': 0.3, '2000': 0.25, '2010': 0.2, '2020': 0.15, '1980': 0.1 },
};

export const tinyLibraryTaste: TasteSignal = {
  librarySize: 6,
  topArtists: [
    { spotify_id: null, name: 'Some Artist', frequency: 1 },
    // < 5 artists triggers library_too_small fallback in compute
  ],
  tasteVector: null,
  libraryDecadeFractions: {},
};

export function makeCandidate(opts: Partial<AlbumCandidate> & {
  spotify_id: string;
  primary_artist_name: string;
  best_similarity_match: number;
  source_path_freq: number;
}): AlbumCandidate {
  return {
    spotify_id: opts.spotify_id,
    title: opts.title ?? `Album ${opts.spotify_id}`,
    primary_artist_name: opts.primary_artist_name,
    total_tracks: opts.total_tracks ?? 10,
    best_similarity_match: opts.best_similarity_match,
    source_paths: [{
      source_artist: { spotify_id: 'src', name: 'Source', frequency: opts.source_path_freq },
      similar_match: opts.best_similarity_match,
    }],
    lastfm_listeners: opts.lastfm_listeners ?? 50000,
    release_year: opts.release_year ?? 2015,
    album_type: 'album',
  };
}
```

`supabase/functions/_shared/recommendation-algorithm.test.ts`:

```ts
import { assertEquals, assert } from 'https://deno.land/std/testing/asserts.ts';
import { scoreCandidates, selectFromTop } from './recommendation-algorithm.ts';
import { makeRng } from './rng.ts';
import { undergroundTaste, makeCandidate } from '../../../tests/algorithm-fixtures.ts';

Deno.test('selectFromTop returns null on empty', () => {
  assertEquals(selectFromTop([], makeRng(42)), null);
});

Deno.test('underground profile: high-similarity candidate beats high-popularity stranger', () => {
  const candidates = [
    makeCandidate({
      spotify_id: 'narrow_match', primary_artist_name: 'Coil',
      best_similarity_match: 0.85, source_path_freq: 20, lastfm_listeners: 10_000,
    }),
    makeCandidate({
      spotify_id: 'mainstream_drift', primary_artist_name: 'Coldplay',
      best_similarity_match: 0.10, source_path_freq: 1, lastfm_listeners: 5_000_000,
    }),
  ];
  const scored = scoreCandidates(candidates, undergroundTaste, makeRng(42));
  assertEquals(scored[0].candidate.spotify_id, 'narrow_match');
});

Deno.test('release_balance: underrepresented decade gets boost', () => {
  const c1980 = makeCandidate({
    spotify_id: 'rare_decade', primary_artist_name: 'X',
    best_similarity_match: 0.5, source_path_freq: 5, release_year: 1985,
  });
  const c2010 = makeCandidate({
    spotify_id: 'common_decade', primary_artist_name: 'Y',
    best_similarity_match: 0.5, source_path_freq: 5, release_year: 2015,
  });
  // undergroundTaste has '2010': 0.2, '1980': 0.1 → 1980 should score higher
  const scored = scoreCandidates([c1980, c2010], undergroundTaste, () => 0.5);
  assert(scored[0].candidate.spotify_id === 'rare_decade');
});

// Run: cd supabase/functions/_shared && deno test --allow-env
```

### 10.2. End-to-end на боевом аккаунте

**Регламент:**

```sql
-- 1. Сбросить today's pick
delete from public.albums_of_the_day
  where user_id = auth.uid()
    and date = (now() at time zone (select coalesce(timezone, 'UTC') from public.profiles where id = auth.uid()))::date;

-- 2. Ручной вызов compute (в терминале)
-- curl -X POST 'https://<ref>.supabase.co/functions/v1/compute-album-of-the-day' \
--   -H 'Authorization: Bearer <CRON_SECRET>' \
--   -H 'Content-Type: application/json' \
--   -d '{"user_id":"<uuid>"}'

-- 3. Проверить результат
select aotd.date, aotd.is_fallback, aotd.fallback_reason, a.title, a.primary_artist_name, aotd.selection_reason
from public.albums_of_the_day aotd
join public.albums a on a.id = aotd.album_id
where aotd.user_id = auth.uid()
order by aotd.date desc limit 5;
```

**Что проверить руками:**
- [ ] Рекомендованные альбомы реально соседствуют со вкусом юзера (source_paths.source_artist должны быть в `user_library`)
- [ ] Underground юзер (твоя electronic библиотека) получает underground recs, а не Coldplay/Drake
- [ ] Нет повторов в `recommendation_history`
- [ ] Compilations / live отфильтрованы (открыть рекомендацию в Spotify, убедиться что studio album)
- [ ] Artist-diversity guard работает (compute два дня подряд, разные primary artists)
- [ ] Timezone correct: дёргаем compute руками за час до push time локального — pick готов
- [ ] Fallback тестируется (broke Spotify token → compute → должен дать fallback с `fallback_reason='unknown_error'` или подобным)

### 10.3. Cron-симуляция

```sql
-- Какие юзеры должны быть взяты сейчас?
select * from public.find_users_due_for_compute(60);

-- Принудительный dispatch
select net.http_post(
  url := '<project_url>/functions/v1/dispatch-daily-picks',
  headers := jsonb_build_object(
    'Authorization', 'Bearer <CRON_SECRET>',
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb
);
```

---

## 11. Definition of Done

- [ ] **Task 0:** `tests/smoketest-apis.sh` запущен, результаты в `plans/phase-4-api-smoketest.md`. Зафиксированы доступности `audio-features` и `related-artists` для нашего Spotify app.
- [ ] Все 4 миграции применены в правильном порядке; типы регенерированы
- [ ] Vault содержит `cron_secret` и `project_url`
- [ ] Edge Function secrets установлены: `LASTFM_API_KEY`, `LASTFM_USER_AGENT`, `MUSICBRAINZ_USER_AGENT`, `CRON_SECRET`
- [ ] `lib/auth.ts` запрашивает `user-read-private`; без этого `/me.product` не гарантирован
- [ ] `upsert-streaming-connection` записывает `spotify_product` для всех новых OAuth
- [ ] `sync-spotify-library` заполняет `primary_artist_spotify_id` и `artist_ids` при sync
- [ ] `compute-album-of-the-day` задеплоена; smoke test для тестового аккаунта проходит
- [ ] `dispatch-daily-picks` задеплоена; `find_users_due_for_compute` корректно возвращает due-юзеров для разных timezones (тест минимум 3: US, UK, RU/Asia)
- [ ] `prewarm-album-cache` задеплоена; после первого запуска `albums.is_prewarm_seed = true` хотя бы для 200 строк
- [ ] Prewarm успешно выполнен **до** первого E2E compute, чтобы fallback path не мог упереться в пустой seed cache
- [ ] pg_cron jobs `dispatch-daily-picks` (hourly) и `prewarm-album-cache` (daily 03:00 UTC) запланированы и видны в `cron.job`
- [ ] `sync-spotify-library` триггерит day-1 compute fire-and-forget после `status='completed'`
- [ ] Home screen: при наличии pick за сегодня (в локальном tz!) — `TodayCard`, иначе `WaitingForPick`
- [ ] Realtime: новая строка в `albums_of_the_day` мгновенно появляется на Home без перезагрузки
- [ ] `useTodayPick` использует RPC `get_current_pick` (не клиентскую UTC-дату)
- [ ] `selection_reason` парсится в `formatSelectionReason()` и читается как humor + low-pressure фраза
- [ ] Underground аккаунт получает underground recs (verified на боевом 10k+ аккаунте)
- [ ] Artist-diversity guard работает (тест: compute 2 дня подряд, primary_artist разный)
- [ ] Repeat guard работает (force compute дважды — second даёт already_exists или новый альбом)
- [ ] Compilations/live корректно отфильтрованы (5 spot-проверок)
- [ ] Fallback path тестирован — `fallback_reason` корректно заполняется
- [ ] Deterministic algorithm tests проходят: `cd supabase/functions/_shared && deno test --allow-env`
- [ ] `tsc --noEmit` зелёный, Biome lint зелёный
- [ ] E2E новый юзер: OAuth → library sync → видишь первую рекомендацию в той же сессии

---

## 12. Что НЕ делаем в фазе 4 (явный non-scope)

- **Карточка альбома (full styled UI)** — фаза 5. Сейчас placeholder.
- **Ratings UI** — фаза 5.
- **Share intent** — фаза 5.
- **Discoveries screen rich UI** — фаза 5.
- **Push notifications** — фаза 7.
- **Spotify Free explainer UI** — фаза 5 (мы только добавили колонку БД).
- **Stats / Profile rich content** — фаза 6.
- **Variety controls** ("не 3 ambient подряд") — v2+.
- **Mood/season hints** — v2+.
- **Discogs scores** — v2+.
- **AOTY/RYM imports** — v2/v3.
- **MusicBrainz enrichment beyond release-group lookup** — не нужно для v1.
- **Collaborative filtering** — v3+.
- **A/B framework** — `algorithm_version` колонка заложена, real A/B — v2+.
- **Audio-features scoring / candidate album sampling** — отложено в v1.5 enhancement (см. §13 риски). В v1 audio capability только проверяется и может храниться для debug, но не влияет на рекомендацию.

---

## 13. Риски и митигации

| Риск | Митигация |
|---|---|
| **Spotify `/audio-features` ограничен (403)** | Detection в Task 0. `fetchAudioFeaturesBatchOptional` обрабатывает gracefully. V1 scoring не зависит от audio features, поэтому это не блокер |
| **Spotify `/related-artists` ограничен** | Аналогично — `getSpotifyRelatedCached` возвращает null, candidate generation продолжает на Last.fm |
| **Last.fm недоступен (5xx, key revoked)** | Primary recommendation не может построить similar-artist pool, поэтому candidate generation быстро останавливается после повторных ошибок. Compute → curated fallback с `fallback_reason='lastfm_unavailable'` |
| **MusicBrainz медленный (1 req/sec)** | Отдельный `musicbrainz_release_group_cache` + `maxMusicBrainzLookups=40` на cold cache. Non-blocking — null = assume album-like |
| **Spotify search rate limit при большом dispatch batch** | CONCURRENCY=5 в dispatch + short per-call timeout/429 retry в `searchAlbum`. После повторных search failures candidate generation прекращается и отдаёт fallback |
| **Edge Function wall-time превышен** | Production compute ограничен коротким primary budget (~25s), `maxSourceArtists=6`, `maxCandidates=24`, `maxMusicBrainzLookups=4`. Worst case быстро уходит в curated fallback вместо wall-clock shutdown |
| **Юзер с пустой/маленькой библиотекой** | `extractTasteSignal` topArtists < 5 → fallback с `library_too_small` |
| **Алгоритм сваливается в попсу** | popularity_log_percentile считается **внутри пула**, не глобально. Underground аккаунт даст underground pool. Verified в фазе тестирования |
| **Один и тот же артист рекомендуется неделями** | `recentArtistsToAvoid` set в `generateCandidates` + `curated-fallback`. Last 30 days picks → artist names excluded |
| **Selection reason слишком generic** | Тестируем формулировку на разных профилях. Conkretные фразы ("Boards of Canada and similar artists") а не "based on your taste" |
| **Cron job упал silently** | `cron.job_run_details` для аудита. Sentry для Edge Function errors (фаза 7) |
| **Day-1 compute упал, юзер видит WaitingForPick** | RouterGuard не блокирует Home если library sync завершён. `WaitingForPick` объясняет: "Your pick is brewing... should be ready by your usual push time." Не error |
| **Fallback cache пустой до первого prewarm** | `prewarm-album-cache` содержит bootstrap seed list и обязан успешно выполниться до E2E/beta. DoD проверяет минимум 200 `is_prewarm_seed` строк |
| **Timezone bug — push в UTC а не локальном** | `find_users_due_for_compute` использует timestamp-based logic, handle midnight wraparound. Тест минимум 3 timezones |
| **`get_current_pick` возвращает empty если compute не запустился сегодня** | OK: `WaitingForPick` показывается. Cron подхватит при следующем tick |
| **Audio-features sampling отключён в v1** | `tasteVector` может считаться для debug/v1.5 readiness, но `scoreCandidates` его не принимает. V1.5 добавит candidate album-tracks fetch + batch features отдельным изменением |

---

## 14. Тайминг (с буфером)

| Шаг | Время |
|---|---|
| Task 0 — API smoke test + анализ результатов | 0.5 дня |
| Миграции (×4) + RPC | 1 день |
| Vault + secrets setup | 0.5 дня |
| `_shared/lastfm.ts` | 0.5 дня |
| `_shared/musicbrainz.ts` | 0.5 дня |
| `_shared/spotify-extended.ts` | 1 день |
| `_shared/external-cache.ts` | 1 день |
| `_shared/rng.ts` + golden fixtures | 0.5 дня |
| `_shared/taste-extraction.ts` | 1 день |
| `_shared/candidate-generation.ts` | 2 дня |
| `_shared/recommendation-algorithm.ts` + tests | 1.5 дня |
| `_shared/curated-fallback.ts` | 0.5 дня |
| Edge Function `compute-album-of-the-day` | 2 дня |
| Edge Function `dispatch-daily-picks` | 0.5 дня |
| Edge Function `prewarm-album-cache` | 1 день |
| pg_cron setup + Vault | 0.5 дня |
| Day-1 trigger + sync-spotify-library обновления + upsert-streaming-connection (spotify_product) | 1 день |
| Клиентский слой (useTodayPick, TodayCard placeholder, Home update) | 1 день |
| **E2E + дебаг алгоритма** | 3 дня |
| **Буфер на rate-limit / неожиданности** | 2 дня |

**Итого:** ~21 день чистого времени. Растягиваем на 3–3.5 недели по 1.5–2 часа в день.

Самые сложные шаги: candidate-generation (много external API + cache logic), e2e debugging (rate limits, timezone, quality of recs на разных профилях).

---

## 15. Точки обращения к Claude Code

Разбиваем на **7 задач**:

1. _"Фаза 4 задача 0: создай `tests/smoketest-apis.sh` по §4.2 и инструкцию `plans/phase-4-api-smoketest.md` (template для результатов). Я запущу руками с боевым токеном. Не пиши никакой алгоритм пока."_

2. _"Фаза 4 задача 1: создать 4 миграции по §3 в правильном порядке. Применить через `supabase db push`. Перегенерировать `types/database.ts`. Проверь lint/typecheck. Diff и стоп."_

3. _"Фаза 4 задача 2: реализуй helpers `_shared/lastfm.ts`, `_shared/musicbrainz.ts`, `_shared/spotify-extended.ts`, `_shared/external-cache.ts`, `_shared/rng.ts` по §5. Перед написанием прочитай актуальные доки Last.fm 2.0 (artist.getsimilar, artist.gettopalbums, album.getinfo, chart.gettopartists) и MusicBrainz Search API. Diff и стоп."_

4. _"Фаза 4 задача 3: реализуй чистую логику `_shared/taste-extraction.ts`, `_shared/candidate-generation.ts`, `_shared/recommendation-algorithm.ts`, `_shared/curated-fallback.ts` по §6. recommendation-algorithm.ts должен быть pure — никаких внешних вызовов. RNG должен быть injectable. Diff и стоп."_

5. _"Фаза 4 задача 4: реализуй Edge Function `compute-album-of-the-day` по §7.1. Также обнови `sync-spotify-library` для day-1 trigger (§7.4) и `primary_artist_spotify_id`/`artist_ids` filling. Обнови `upsert-streaming-connection` чтобы писать `spotify_product` (§7.5). Не деплой — я задеплою после ревью."_

6. _"Фаза 4 задача 5: реализуй Edge Functions `dispatch-daily-picks` и `prewarm-album-cache` (§7.2, §7.3) + клиентский слой (useTodayPick на RPC, TodayCard placeholder, WaitingForPick, Home update). Создай golden tests (§10.1). Diff и стоп."_

7. _"Фаза 4 задача 6: после моего e2e подтверждения — настрой pg_cron jobs через SQL editor (§8). Закомитить двумя коммитами: `feat(phase-4): recommendation algorithm core` и `feat(phase-4): cron dispatch + day-1 trigger + prewarm`. Обнови `plans/master-plan.md` §5 фаза 4 со статусом ✅."_

В каждой задаче — обязательно: **"перед кодом прочитай актуальные доки Supabase JS v2 и docs соответствующих внешних API"**.

---

## 16. Открытые вопросы (TBD по ходу)

- [ ] Финальный `market` для Spotify (v1 жёстко 'US'; стоит ли парсить из `/me.country`)? — решаем на e2e если рекомендации заметно скошены
- [ ] Threshold "min library artists for non-fallback" — сейчас 5; смотрим на реальных аккаунтах
- [ ] Audio-features scoring per candidate album (album-tracks fetch + batch features) — v1.5 enhancement, метрика для решения: стоит ли качество recs дополнительной нагрузки Spotify API
- [ ] Размер candidate pool (сейчас maxCandidates=250) vs время compute — после первых прогонов
- [ ] TTL для `artist_similarity_cache` (30 дней) и `audio_features_cache` (180 дней) — корректируем по факту
- [ ] Когда переходить на queue/worker если cron не справится — пост-launch concern
- [ ] Spotify market mismatch (user в EU, market='US') может давать пустые `/search` результаты — мониторим

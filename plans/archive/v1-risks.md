# V1 launch risks & pre-launch checklist

> **Дата создания:** 2026-05-25
> **Назначение:** Единая проверка перед публичным релизом v1. Каждый пункт — gating item: пока не закрыт, в App Store не подаёмся.
> **Используется в:** фаза 7 (closed beta) и фаза 8 (App Store submit).

---

## 1. Spotify gates (БЛОКЕРЫ)

### 1.1 Extended Quota Mode

- [ ] Заявка подана (timing: начало фазы 7, чтобы 3–6 недель review закончились до фазы 8)
- [ ] Заявка содержит:
  - [ ] Точное описание use-case: "daily album recommendation based on user's saved library, with deep links to play on Spotify"
  - [ ] Скриншоты actual UI app'a где видны "Open in Spotify", "Powered by Spotify"
  - [ ] Privacy policy URL
  - [ ] Подтверждение что мы НЕ делаем: streaming/downloading audio, derivative streaming UI, hiding/altering Spotify content
- [ ] **Approval получен** ← без этого не релизимся в App Store

### 1.2 Spotify Design Guidelines compliance

- [ ] Все deep-link кнопки используют точное wording: "Open in Spotify"
- [ ] "Powered by Spotify" footer/badge в видимом месте (карточка альбома или Profile)
- [ ] Spotify logo используется по официальным правилам (SVG из press kit, не модифицирован, минимальный размер выдержан)
- [ ] Album cover отображается с правильным aspect ratio (без crop квадрата если оригинал не квадратный)
- [ ] НЕТ замаскированных deep-link'ов (типа "Listen now" без указания Spotify)
- [ ] НЕТ derivative streaming features (play/pause/seek внутри нашего app'a)

### 1.3 Spotify Free handling

- [ ] `streaming_connections.spotify_product` парсится из `/me.product` при OAuth и при refresh
- [ ] Free-юзеры видят дискретный, dismissible explainer один раз: "Free Spotify may shuffle tracks — Premium plays the album in order"
- [ ] App не показывает product status в UI как permanent badge (это privacy concern)

---

## 2. Privacy & legal (Apple compliance)

### 2.1 Privacy nutrition labels (точный заполненный чеклист)

| Data type | Collected | Linked to user | Used for tracking | Justification |
|---|---|---|---|---|
| Spotify access/refresh tokens | Yes | Yes | No | App functionality (sync library, refresh tokens) |
| Spotify library (saved albums/tracks) | Yes | Yes | No | Algorithm input (recommendations) |
| User ratings | Yes | Yes | No | App functionality (personal journal, profile stats) |
| Push token | Yes | Yes | No | Daily push notification |
| Email | Yes (от Supabase Auth) | Yes | No | Account identification, GDPR contact |
| Display name | Yes | Yes | No | Personalization |
| Crash logs (Sentry) | Yes | No (PII-stripped) | No | App diagnostics |
| Usage events (PostHog/Amplitude) | Yes | Yes (user_id) | No | Product analytics |
| Country/locale | Yes | Yes | No | Push timing, content surface |

- [ ] Labels заполнены в App Store Connect
- [ ] Каждый "Yes" имеет соответствующее обращение в коде/Edge Functions (audit pass)
- [ ] НЕТ unused permissions/scopes — все Spotify scopes, push, etc. реально используются

### 2.2 GDPR compliance

- [ ] Delete account flow работает end-to-end:
  - [ ] UI кнопка в Profile → Settings → Delete account (confirmation modal с явным "это удалит всё навсегда")
  - [ ] Серверный cascade delete: profiles, streaming_connections, user_library, library_sync_status, albums_of_the_day, ratings, recommendation_history
  - [ ] Spotify token revocation: POST к `https://accounts.spotify.com/api/token/revoke` с нашим refresh_token (юзер увидит отзыв в Spotify Settings → Apps)
  - [ ] Edge Function delete-account проверена на real аккаунте — все следы убраны
- [ ] Privacy policy web-hosted и доступна по URL (linked в App Store Connect и в app Settings)
- [ ] Terms of Service web-hosted
- [ ] (опционально, плюс к compliance) Data export в JSON через Edge Function

### 2.3 Apple Human Interface Guidelines

- [ ] Push permission flow: explainer экран ДО нативного prompt'a
- [ ] App не launch'ит сразу с modal/permission — есть нормальный UI до первого ask
- [ ] App Store screenshots соответствуют реальному UI (не моки)
- [ ] App Store description не содержит конкурент-claims ("better than Spotify's Discover Weekly")
- [ ] iPad support либо явно работает, либо явно отключён (mobile-only — указано)

---

## 3. Brand & positioning

- [ ] **App name финальный** — НЕ "Album of the Day" (generic SEO).
  - [ ] Проверен в App Store search (нет collision)
  - [ ] Проверен в trademark databases (USPTO basic search)
  - [ ] Distinctive, brandable, 1–2 слова
  - [ ] Domain `.com`/`.app` доступен (для landing/privacy policy)
- [ ] **Color palette** — собственная, НЕ `#1db954` Spotify green
  - [ ] Tab bar active tint
  - [ ] Primary button colors
  - [ ] Accents в карточках
- [ ] **App icon** — distinctive, читается на 1024×1024 и на 60×60
- [ ] **Splash screen** — на бренд

---

## 4. Core functionality verification

### 4.1 Algorithm quality

- [ ] Closed beta фидбек: ≥ 60% юзеров оценивают свои рекомендации `Liked it` или выше
- [ ] Cold start verified: новый аккаунт с 50+ saved albums получает осмысленную (не рандомную) рекомендацию в первый день
- [ ] Small library fallback verified: аккаунт с 10 albums получает что-то (не error)
- [ ] Underground genres verified: аккаунт с библиотекой только дrop-niche артистов получает похожих, не топ-50 globally
- [ ] Recency: алгоритм не выдаёт один и тот же альбом дважды в течение 365 дней (`recommendation_history` фильтр работает)

### 4.2 Error states

- [ ] Spotify connection broken → "Reconnect" UI, Discoveries history остаётся доступной
- [ ] Refresh token failure → auto-sync блокируется с exponential backoff, не молотит
- [ ] No internet → cached AOTD и Discoveries видны
- [ ] Algorithm нашёл 0 кандидатов → graceful fallback message, не crash

### 4.3 Sync edge cases

- [ ] Большая библиотека (10k+ tracks) — sync завершается без wall-time timeout (см. `phase-3-library-import.md §6a` стратегия)
- [ ] Spotify 429 rate limit во время sync → graceful retry, status → `failed` с понятным message
- [ ] Sync stuck в `syncing` > 10 min → клиентский Try again button работает

### 4.4 Timezone

- [ ] Push приходит в `preferred_push_time` юзера по его timezone (не UTC)
- [ ] Compute AOTD выполняется в окне ≤ 2 часа до push time
- [ ] Тест аккаунты в разных timezones (US/UK/AU) получают push в правильное локальное время

---

## 5. Performance & reliability

- [ ] App запускается с холодного старта < 3s на iPhone 12+
- [ ] Carry-over с background → foreground корректен (session restore, no flash splash для existing users)
- [ ] Sentry ловит реальные production-like ошибки в beta
- [ ] PostHog/Amplitude events приходят в дашборд
- [ ] Supabase free-tier limits не превышены: < 500 MAU, < 50k Edge Function invocations/month, < 2GB DB

---

## 6. App Store submission readiness

- [ ] EAS production build собирается без warnings
- [ ] Apple Developer Program активен ($99)
- [ ] Bundle identifier финальный (не меняется после первого submit)
- [ ] Версия 1.0.0, build 1
- [ ] App Store Connect: app created, metadata заполнен
- [ ] Screenshots для iPhone 6.7" / 6.5" / 5.5" (обязательно для submission)
- [ ] App preview video (опционально, но boost к conversion)
- [ ] Keywords оптимизированы — не дублируют name, целят на "album discovery", "music recommendations", "daily music"
- [ ] Category: Music (primary), Lifestyle (secondary, опционально)
- [ ] Age rating: 12+ (нет user-generated public content в v1, но Spotify integration может иметь explicit content)
- [ ] Soft launch markets: US / UK / CA / AU (English-speaking)
- [ ] Rollback plan: previous version хранится в EAS, можно откатить через App Store Connect

---

## 7. Post-launch monitoring (первые 2 недели)

- [ ] Sentry — daily check на новые crash patterns
- [ ] PostHog/Amplitude — retention day 1 / 3 / 7
- [ ] App Store reviews — daily check, ответы в течение 48h
- [ ] Spotify API metrics — нет неожиданных rate-limit hits
- [ ] Supabase usage — приближение к free-tier limits

---

## 8. Что НЕ блокирует launch (можно после)

- Apple Music integration (v1.1+)
- RYM/AOTY user-imported profile (v2/v3)
- Social features (v2)
- Advanced Stats charts (taste evolution graphs, etc.)
- Monetization / subscription
- Web companion / landing
- Localization (RU и др.)
- Streak гибкости настройки
- Variety controls в алгоритме

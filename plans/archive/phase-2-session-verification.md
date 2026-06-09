# Phase 2 Session Verification

Цель файла: быстро проверить изменения, внесённые в сессии реализации Spotify Auth + базового профиля, без повторного чтения всего плана.

## 1. Что изменено

- Добавлен Spotify OAuth flow через Supabase Auth + PKCE:
  - `lib/auth.ts`
  - `lib/supabase.ts`
  - `components/auth/AuthProvider.tsx`
  - `components/auth/SpotifyButton.tsx`
  - `app/(auth)/sign-in.tsx`
  - `app/auth/callback.tsx`
- Добавлены route guards:
  - `app/_layout.tsx`
  - `app/(tabs)/_layout.tsx`
- Переписан Profile screen на реальные данные:
  - `app/(tabs)/profile.tsx`
  - `components/ui/Avatar.tsx`
- Добавлена Spotify token storage схема:
  - `supabase/migrations/20260523010000_streaming_connections.sql`
  - `types/database.ts`
- Добавлены Edge Functions:
  - `supabase/functions/upsert-streaming-connection/index.ts`
  - `supabase/functions/refresh-spotify-token/index.ts`
  - `supabase/functions/_shared/cors.ts`
  - `supabase/functions/_shared/spotify.ts`
- Обновлены env/config/deps:
  - `.env.example`
  - `app.config.ts`
  - `package.json`
  - `package-lock.json`
  - `supabase/config.toml`
  - `tsconfig.json`
- Обновлены документы:
  - `plans/phase-2-spotify-auth.md`
  - `CLAUDE.md`

## 2. Локальные проверки

Запустить из корня проекта:

```bash
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npx expo install --check
git diff --check
```

Ожидаемый результат:

- Biome без ошибок.
- TypeScript без ошибок.
- Expo dependencies up to date.
- `git diff --check` без trailing whitespace/conflict markers.

## 3. Проверка безопасности БД

После `supabase db push` проверить:

- `public.streaming_connections` существует.
- `public.streaming_connections_safe` существует.
- В `streaming_connections_safe` нет `access_token` и `refresh_token`.
- Клиентский `select('*')` по `streaming_connections` не должен возвращать токены.
- Клиентский `select('*')` по `streaming_connections_safe` должен вернуть только строку текущего пользователя или пустой массив.

Важное правило ревью: не добавлять `SELECT` policy на базовую таблицу `streaming_connections`.

Примечание: в Supabase SQL Editor `select * from public.streaming_connections_safe;` может вернуть `Success. No rows returned`, потому что SQL Editor выполняется без пользовательского JWT и `auth.uid()` равен `null`. Это нормально. Реальная проверка safe view — из authenticated клиента или через dashboard/API с JWT текущего пользователя.

## 4. Проверка Edge Functions

Перед деплоем убедиться, что в Supabase Dashboard есть secrets:

```text
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
```

Деплой:

```bash
supabase functions deploy upsert-streaming-connection
supabase functions deploy refresh-spotify-token
```

Smoke test после первого логина:

```bash
supabase functions invoke refresh-spotify-token --body '{"user_id":"<user uuid>"}'
```

Ожидаемо:

- `upsert-streaming-connection` создаёт или обновляет строку `streaming_connections`.
- Если `provider_refresh_token` не пришёл при повторном OAuth, функция переиспользует сохранённый refresh token.
- `refresh-spotify-token` обновляет `access_token` и `token_expires_at`.
- Не service-role вызов не может обновить токен другого `user_id`.

## 5. Проверка OAuth на устройстве

Перед тестом руками настроить:

- Spotify Dashboard:
  - Redirect URI: `https://<supabase-ref>.supabase.co/auth/v1/callback`
  - Bundle ID: `com.pesnya.albumoftheday`
  - Users and Access: добавить тестовый Spotify email
- Supabase Dashboard:
  - Spotify provider включён
  - Site URL: `albumoftheday://`
  - Redirect URLs: `albumoftheday://**`, `exp://**`, точный `exp://.../--/auth/callback` из Metro лога
  - Edge Function secrets добавлены

E2E сценарий:

1. Запустить Expo на SDK 54.
2. Открыть app в Expo Go.
3. Без сессии должен открыться `app/(auth)/sign-in.tsx`.
4. Нажать `Continue with Spotify`.
5. После Spotify consent приложение должно вернуться в tabs.
6. Profile должен показать Spotify display name и avatar.
7. В Supabase `profiles` должны обновиться `display_name` и `avatar_url`.
8. В `streaming_connections` должна появиться строка `provider = 'spotify'`.
9. `Log out` должен вернуть на sign-in.
10. Перезапуск приложения с активной сессией должен восстановить пользователя.

## 6. Что не проверяется локально автоматически

- Реальный Spotify OAuth redirect в Expo Go.
- Supabase Dashboard provider settings.
- Edge Function deploy/runtime в hosted Supabase.
- `npm run db:types` против live linked project.
- Vault/прозрачное шифрование токенов: в этой фазе сделан service-role-only доступ + safe view, Vault hardening оставлен на отдельную миграцию.

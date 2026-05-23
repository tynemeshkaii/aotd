# Фаза 2 — Spotify Auth + базовый профиль

> Детальный план реализации. Опирается на [master-plan.md](./master-plan.md) §5 (фаза 2).
> Сроки: 1–2 недели (8–12 рабочих сессий).
> Цель: пользователь нажимает "Continue with Spotify", после OAuth получает аутентифицированную Supabase-сессию, на экране Profile видит свои display_name и аватар из Spotify, может разлогиниться. Token хранится в нашей БД, есть Edge Function для его рефреша, готовая к использованию в фазе 3.

---

## 0. Технические решения (зафиксированы)

| Что | Выбор | Почему |
|---|---|---|
| OAuth flow | **Supabase Auth → Spotify provider** | Supabase сам делает PKCE, валидацию state, обмен code→token, возвращает JWT для авторизации в БД с RLS. Один SDK-вызов вместо ручной OAuth-машинерии |
| Деплой среда | **Expo Go (остаёмся)** | Supabase OAuth работает через redirect на `supabase-url/auth/v1/callback` → deep link в наше приложение. В Expo Go scheme — `exp://...`, в production — `albumoftheday://`. AuthSession разруливает оба случая. Dev build переносим на фазу 4 или 6 |
| Spotify scopes | `user-library-read`, `user-top-read` | Минимум для core-loop. Без `user-read-email` (не нужен email). Без `user-read-private` (не нужны country/product). Минимум разрешений → выше конверсия на consent-screen |
| Откуда берём профиль | **Spotify `/me`** при первом логине | Display name + avatar URL. БД `auth.users.email` будет пустым |
| Хранение Spotify токенов | Таблица `streaming_connections` | Supabase возвращает `provider_token`/`provider_refresh_token` в сессии, но **не сохраняет их** в БД. Нам нужны для Edge Functions (sync библиотеки, recommendation algorithm), которые работают без юзер-сессии. Зеркалим в свою таблицу при логине |
| Защита токенов в БД | **Service-role only + safe view; Vault hardening позже** | В фазе 2 включаем `pgsodium`, но не даём клиенту `SELECT` на базовую таблицу с токенами. Клиент читает только `streaming_connections_safe`; запись/refresh идут через Edge Functions. Прозрачное шифрование/Vault можно добавить отдельной миграцией перед публичным релизом |
| Рефреш токенов | Edge Function `refresh-spotify-token`, вызываемая по запросу + cron каждый час | По запросу из других Edge Functions (lazy refresh). Клиентский вызов валидирует JWT и запрещает чужой `user_id`; service-role вызов разрешён для серверных функций. Cron — на будущее, для активных юзеров перед утренней генерацией альбома (фаза 4) |
| Auth state в клиенте | `useSession()` хук поверх `supabase.auth.onAuthStateChange` | Через React Context. Reactивно реагирует на login/logout |
| Защищённые роуты | expo-router groups: `(auth)/` для логина, `(tabs)/` под сессией | Если сессии нет — редирект в `(auth)/sign-in`. Если есть — в `(tabs)/` |
| Expo AuthSession | **SDK 54 bundled version `~7.0.11`** | Старые заметки про v6 относятся к SDK 53. Для SDK 54 ставим через `expo install` и проверяем `npx expo install --check`, SDK не bump'аем |
| Тестовый юзер | Spotify-аккаунт владельца (твой) | На Spotify в Dev Dashboard добавляем email юзера в "Users and Access" пока приложение в Development Mode |
| Quota mode Spotify app | **Development Mode** до релиза | До 25 named users. Расширение запрашиваем перед публичным релизом (фаза 8) — это отдельный процесс с Quota Extension Request |

---

## 1. Что меняется в проекте

### 1.1. Новые файлы / папки

```
app/
├── _layout.tsx                    # ← обновляется: AuthProvider, redirect logic
├── auth/
│   └── callback.tsx               # ← новый: устойчивое завершение OAuth deep link
├── (auth)/
│   ├── _layout.tsx                # ← новый: только для unauthenticated
│   └── sign-in.tsx                # ← новый: экран логина
└── (tabs)/
    ├── _layout.tsx                # ← обновляется: protected, redirect если нет сессии
    └── profile.tsx                # ← переписывается: реальные данные + logout

components/
├── auth/
│   ├── SpotifyButton.tsx          # ← новый: брендированная кнопка по гайдлайнам Spotify
│   └── AuthProvider.tsx           # ← новый: Context + onAuthStateChange
└── ui/
    └── Avatar.tsx                 # ← новый: круглая аватарка с fallback

lib/
├── auth.ts                        # ← новый: signInWithSpotify, signOut helpers
├── spotify.ts                     # ← новый: Spotify Web API wrapper (тонкий)
└── hooks/
    ├── useSession.ts              # ← новый
    └── useSpotifyProfile.ts       # ← новый: react-query запрос /me

supabase/
├── migrations/
│   └── 20260601000000_streaming_connections.sql   # ← новая миграция
├── functions/
│   ├── _shared/
│   │   ├── cors.ts                # стандартный helper Supabase
│   │   └── spotify.ts             # серверный клиент Spotify
│   ├── refresh-spotify-token/
│   │   ├── index.ts
│   │   └── deno.json
│   └── upsert-streaming-connection/
│       ├── index.ts               # вызывается из клиента после signInWithOAuth
│       └── deno.json

types/
└── database.ts                    # ← обновляется вручную до live db:types
```

### 1.2. Изменения в существующих файлах

- `app.config.ts` — добавить `extra.spotifyClientId` (только client ID, secret в Supabase Dashboard и Edge Function secrets, **никогда** в клиенте)
- `.env.example` / `.env.local` — добавить `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
- `lib/env.ts` — расширить `EnvSchema`
- `lib/supabase.ts` — включить `flowType: 'pkce'` и AppState auto-refresh hooks для React Native
- `package.json` / `package-lock.json` — добавить SDK 54 совместимые `expo-auth-session`, `expo-crypto`, `expo-web-browser`
- `tsconfig.json` — исключить `supabase/functions` из app `tsc`, потому что они типизируются Deno runtime'ом отдельно
- `app/(tabs)/profile.tsx` — переписать целиком
- `app/_layout.tsx` — обернуть в `AuthProvider`, добавить redirect logic
- `app/(tabs)/_layout.tsx` — добавить guard "no session → redirect to sign-in"
- `supabase/config.toml` — добавить локальные redirect URLs и `verify_jwt = false` для функций, которые сами валидируют `Authorization`

---

## 2. Пошаговая реализация

### Шаг 1 — Конфигурация Spotify Developer app

**Руками в браузере** (не Claude Code):

1. Открыть [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → существующий app (или создать `Album of the Day`)
2. В Settings → **Redirect URIs** добавить **строго** один URL:
   ```
   https://<твой-supabase-project-ref>.supabase.co/auth/v1/callback
   ```
   *(supabase-project-ref — из Project Settings → API → Project URL)*
3. **Bundle IDs** (iOS) → добавить `com.pesnya.albumoftheday`
4. В разделе **Users and Access** добавить свой Spotify email — иначе Spotify откажет в логине пока app в Development Mode
5. Скопировать **Client ID** и **Client Secret** в безопасное место

**Где это используется:**
- Client ID — публичный, пойдёт в `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` (опционально — Supabase сам знает)
- Client Secret — **только** в Supabase Dashboard и Edge Function secrets

---

### Шаг 2 — Включить Spotify provider в Supabase

**Руками в Supabase Dashboard:**

1. Project → Authentication → **Providers** → Spotify → Enable
2. Вставить **Client ID** и **Client Secret**
3. **Authorized Client IDs** — оставить пустым (mobile flow)
4. Save
5. Authentication → URL Configuration:
   - **Site URL**: `albumoftheday://` *(production scheme)*
   - **Redirect URLs (Allow List)** — добавить:
     ```
     albumoftheday://**
     exp://**
     exp://**/--/auth/callback
     https://auth.expo.io/@<expo-username>/album-of-the-day
     ```
   *Последний нужен только если будем использовать Expo Auth Proxy. На Expo SDK 54 предпочтительнее не использовать — указываем напрямую `albumoftheday://` и `exp://`*

---

### Шаг 3 — Миграция: streaming_connections

Создать `supabase/migrations/<ts>_streaming_connections.sql`:

```sql
-- Phase 2: Spotify auth connection storage.
-- Base token rows are service-role only; the client reads metadata through
-- public.streaming_connections_safe.

create extension if not exists "pgcrypto";
create extension if not exists pgsodium;

-- Универсальная таблица под все будущие стриминги
create table public.streaming_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_user_id text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  -- Один аккаунт стриминга на юзера на провайдер
  unique (user_id, provider)
);

create index streaming_connections_user_idx on public.streaming_connections(user_id);
create index streaming_connections_provider_user_idx
  on public.streaming_connections(provider, provider_user_id);

alter table public.streaming_connections enable row level security;

revoke all on public.streaming_connections from anon, authenticated;
grant delete on public.streaming_connections to authenticated;

-- Insert/Update делается через Edge Function (service role), не через клиент
-- Никаких select/insert/update policy для клиента — токены закрыты

-- Удалить свою связь (logout-disconnect)
create policy "streaming_connections_delete_own"
  on public.streaming_connections
  for delete
  using (auth.uid() = user_id);

-- View для клиента без секретов
create view public.streaming_connections_safe as
  select id, user_id, provider, provider_user_id, scopes, connected_at, last_synced_at
  from public.streaming_connections
  where auth.uid() = user_id;

grant select on public.streaming_connections_safe to authenticated;
```

**Применить:**
```bash
supabase migration new streaming_connections
# вставить SQL выше
supabase db push
npm run db:types
```

**Точка проверки:** в Supabase Dashboard → Table Editor видна `streaming_connections`. Из клиента `supabase.from('streaming_connections').select('*')` вернёт ошибку прав (это норма). `supabase.from('streaming_connections_safe').select('*')` вернёт пустой массив или одну строку текущего пользователя.

**Важно:** до `supabase link` / `npm run db:types` файл `types/database.ts` обновляем вручную под миграцию. После привязки проекта его можно заменить сгенерированным типом.

---

### Шаг 4 — Edge Functions infrastructure

Первый раз настраиваем функции:

1. `supabase functions new upsert-streaming-connection`
2. `supabase functions new refresh-spotify-token`
3. Создать `supabase/functions/_shared/cors.ts` (стандартный) и `_shared/spotify.ts` (helpers).
4. В `supabase/functions/<name>/deno.json` использовать import map:
   ```json
   {
     "imports": {
       "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
     }
   }
   ```
5. В `supabase/config.toml` для обеих функций поставить `verify_jwt = false`: функции принимают preflight `OPTIONS`, сами читают `Authorization`, валидируют JWT через `supabase.auth.getUser()` и поддерживают service-role вызовы.

**Secrets** (в Supabase Dashboard → Edge Functions → Secrets):
```
SPOTIFY_CLIENT_ID=<твой client id>
SPOTIFY_CLIENT_SECRET=<твой client secret>
```

В Supabase Dashboard уже есть автоматические env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Их не объявляем сами.

---

### Шаг 5 — Edge Function `upsert-streaming-connection`

**Назначение:** клиент сразу после `signInWithOAuth` вызывает эту функцию с `provider_token`, `provider_refresh_token` если он есть, `expires_in` и scopes из текущей сессии. Функция верифицирует JWT юзера, дёргает Spotify `/me` чтобы получить `provider_user_id`, и записывает строку в `streaming_connections` под service role. Если Spotify/Supabase не вернули новый `provider_refresh_token` при повторном логине, функция переиспользует уже сохранённый refresh token.

**Псевдокод `supabase/functions/upsert-streaming-connection/index.ts`:**

```ts
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'missing_auth');

    // Клиент с JWT юзера — для проверки кто пришёл
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonError(401, 'invalid_user');

    const body = await req.json() as {
      provider_token: string;
      provider_refresh_token?: string;
      expires_in: number;
      scopes: string[];
    };

    // Получить Spotify ID
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${body.provider_token}` },
    });
    if (!meRes.ok) return jsonError(502, 'spotify_me_failed');
    const me = await meRes.json() as { id: string; display_name?: string; images?: { url: string }[] };

    // Сервисный клиент — для записи под RLS bypass
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: existingConnection, error: existingError } = await admin
      .from('streaming_connections')
      .select('refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'spotify')
      .maybeSingle();
    if (existingError) return jsonError(500, 'db_select_failed', existingError.message);

    const refreshToken = body.provider_refresh_token ?? existingConnection?.refresh_token;
    if (!refreshToken) return jsonError(400, 'missing_provider_refresh_token');

    const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();

    const { error: upsertErr } = await admin
      .from('streaming_connections')
      .upsert({
        user_id: user.id,
        provider: 'spotify',
        provider_user_id: me.id,
        access_token: body.provider_token,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        scopes: body.scopes,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });

    if (upsertErr) return jsonError(500, 'db_upsert_failed', upsertErr.message);

    // Обновить profile.display_name / avatar_url
    await admin.from('profiles').update({
      display_name: me.display_name ?? null,
      avatar_url: me.images?.[0]?.url ?? null,
    }).eq('id', user.id);

    return new Response(JSON.stringify({ ok: true, provider_user_id: me.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return jsonError(500, 'unexpected', String(e));
  }
});

function jsonError(status: number, code: string, detail?: string) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

**Деплой:** `supabase functions deploy upsert-streaming-connection`

---

### Шаг 6 — Edge Function `refresh-spotify-token`

**Назначение:** принимает `user_id` от server/service-role вызова или вычисляет текущего пользователя из JWT, берёт `refresh_token` из БД, дёргает Spotify `/api/token` с `grant_type=refresh_token`, обновляет `access_token` и `token_expires_at`.

Вызывается:
- из других Edge Functions (Service Role) перед обращением к Spotify API, если `token_expires_at < now() + 60s`
- из cron (фаза 4) для активных юзеров

**Псевдокод (сокращённо):**

```ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const { user_id } = await req.json();

  // Если запрос не service role, валидируем JWT и запрещаем refresh чужого user_id.
  // Service-role вызов нужен другим Edge Functions в фазе 3+.

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: conn, error } = await admin
    .from('streaming_connections')
    .select('refresh_token')
    .eq('user_id', user_id)
    .eq('provider', 'spotify')
    .single();
  if (error || !conn) return new Response('not_found', { status: 404 });

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(
        Deno.env.get('SPOTIFY_CLIENT_ID') + ':' + Deno.env.get('SPOTIFY_CLIENT_SECRET'),
      ),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });
  if (!tokenRes.ok) return new Response('refresh_failed', { status: 502 });
  const { access_token, expires_in, refresh_token: newRefresh } = await tokenRes.json();

  await admin
    .from('streaming_connections')
    .update({
      access_token,
      token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      // Spotify иногда возвращает новый refresh_token, иногда нет
      ...(newRefresh ? { refresh_token: newRefresh } : {}),
    })
    .eq('user_id', user_id)
    .eq('provider', 'spotify');

  return new Response(JSON.stringify({ ok: true, access_token, expires_in }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

**Деплой:** `supabase functions deploy refresh-spotify-token`

**Тест:** через `supabase functions invoke refresh-spotify-token --body '{"user_id":"<твой uuid>"}'` после первого логина.

---

### Шаг 7 — Клиентский слой: env + auth helpers

**`.env.example` дополнить:**
```
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=
```

**`lib/env.ts` расширить:**
```ts
const EnvSchema = z.object({
  // ... существующее
  spotifyClientId: z.string().optional(),
});
```

**`app.config.ts` → `extra`:**
```ts
spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID,
```

**`app.config.ts` → `plugins`:**
```ts
plugins: [
  'expo-router',
  'expo-secure-store',
  'expo-web-browser',
  // ...
],
```

**`lib/auth.ts`:**

```ts
import type { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_SCOPES = ['user-library-read', 'user-top-read'] as const;

export function getSpotifyRedirectTo() {
  return AuthSession.makeRedirectUri({
    native: 'albumoftheday://auth/callback',
    path: 'auth/callback',
  });
}

export async function signInWithSpotify() {
  const redirectTo = getSpotifyRedirectTo();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo,
      scopes: SPOTIFY_SCOPES.join(' '),
      skipBrowserRedirect: true, // мы сами открываем
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('no_oauth_url');

  // Открыть в браузере и дождаться возврата
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error(`oauth_${result.type}`);

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);

  if (params.code) {
    const { data: sessionData, error: sessErr } = await supabase.auth.exchangeCodeForSession(
      params.code,
    );
    if (sessErr) throw sessErr;
    return sessionData.session;
  }

  // Fallback для implicit callback, если Supabase project настроен не на PKCE.
  if (params.access_token && params.refresh_token) {
    const { data: sessionData, error: sessErr } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessErr) throw sessErr;
    return sessionData.session;
  }

  throw new Error('missing_oauth_callback_params');
}

export async function syncSpotifyConnection(session?: Session | null) {
  const currentSession = session ?? (await supabase.auth.getSession()).data.session;
  if (!currentSession?.provider_token) {
    throw new Error('missing_provider_token');
  }
  // provider_token.expires_in не возвращается напрямую — берём из session.expires_at
  // но Spotify access_token живёт ~1ч; считаем от now
  const expiresIn = 3600;

  const { error } = await supabase.functions.invoke('upsert-streaming-connection', {
    body: {
      provider_token: currentSession.provider_token,
      provider_refresh_token: currentSession.provider_refresh_token,
      expires_in: expiresIn,
      scopes: [...SPOTIFY_SCOPES],
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
```

> **Важно про OAuth flow PKCE в Supabase JS v2:** в моде PKCE callback содержит `code`, который надо обменять через `exchangeCodeForSession(code)`. Если проект настроен на implicit (legacy), токены приходят в URL и ставятся через `setSession`. Код должен поддерживать оба варианта. Перед правками читать актуальные доки `@supabase/supabase-js` v2 и Expo SDK 54 AuthSession; для SDK 54 bundled version — `expo-auth-session ~7.0.11`, а v6 относится к SDK 53.

---

### Шаг 8 — AuthProvider + useSession

**`components/auth/AuthProvider.tsx`:**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useSession() {
  return useContext(AuthContext);
}
```

**Обернуть в `app/_layout.tsx`:**
```tsx
<AuthProvider>
  <QueryClientProvider client={queryClient}>
    {/* ... */}
  </QueryClientProvider>
</AuthProvider>
```

---

### Шаг 9 — Защита роутов

**`app/_layout.tsx` — добавить redirect logic:**

```tsx
import { useRouter, useSegments, Slot } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '@/components/auth/AuthProvider';

function RouterGuard() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return <Slot />;
}
```

Поставить `<RouterGuard />` внутри `AuthProvider` вместо текущего `<Stack>`.

---

### Шаг 10 — Sign-in screen

**`app/(auth)/_layout.tsx`** — простой Stack без хедера.

**`app/(auth)/sign-in.tsx`:**

```tsx
import { useState } from 'react';
import { View, Alert } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { SpotifyButton } from '@/components/auth/SpotifyButton';
import { signInWithSpotify, syncSpotifyConnection } from '@/lib/auth';

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      const session = await signInWithSpotify();
      await syncSpotifyConnection(session);
    } catch (e) {
      Alert.alert('Не получилось войти', String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View className="flex-1 items-center justify-center">
        <Text variant="h1" className="text-center">Album of the Day</Text>
        <Text variant="caption" className="text-center mt-2 mb-12">
          Один альбом в день, под твой вкус
        </Text>
        <SpotifyButton disabled={loading} loading={loading} onPress={handleSignIn} />
        <Text variant="caption" className="text-center mt-8 px-4">
          Мы прочитаем твою библиотеку альбомов чтобы не предлагать то, что у тебя уже есть.
        </Text>
      </View>
    </Screen>
  );
}
```

**Дизайн кнопки:** отдельный `components/auth/SpotifyButton.tsx`: зелёный фон Spotify, чёрный текст, лого Spotify 24px слева, `ActivityIndicator` в loading-state. К фазе 8 (App Store submission) ещё раз сверить с актуальными Spotify branding guidelines.

---

### Шаг 11 — Профиль

**`app/(tabs)/profile.tsx`:**

```tsx
import { useQuery } from '@tanstack/react-query';
import { View, Alert } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error('missing_user_id');

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: connection } = useQuery({
    queryKey: ['streaming_connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('streaming_connections_safe')
        .select('*')
        .eq('provider', 'spotify')
        .maybeSingle();
      return data;
    },
  });

  return (
    <Screen>
      <Text variant="h1" className="mb-8">Profile</Text>
      {isLoading ? (
        <Text variant="caption">Загружаю…</Text>
      ) : (
        <View className="items-center">
          <Avatar uri={profile?.avatar_url} size={96} />
          <Text variant="h2" className="mt-4">{profile?.display_name ?? 'No name'}</Text>
          {connection && (
            <Text variant="caption" className="mt-2">
              Spotify connected · {new Date(connection.connected_at).toLocaleDateString()}
            </Text>
          )}
          <Button
            variant="ghost"
            className="mt-12"
            title="Log out"
            onPress={() => Alert.alert(
              'Выйти?',
              'Сессия завершится, но данные сохранятся.',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Выйти', style: 'destructive', onPress: signOut },
              ],
            )}
          />
        </View>
      )}
    </Screen>
  );
}
```

---

### Шаг 12 — End-to-end проверка

Чек-лист после деплоя:

1. Скачать `.env.local` с `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
2. `npx expo start`, открыть в Expo Go
3. Видишь экран Sign In (не tabs) — ✅ guard работает
4. Tap "Continue with Spotify" — открывается Safari → Spotify login → "Agree"
5. Возвращаешься в приложение — попадаешь на Home tab
6. Открываешь Profile — видишь свой Spotify display_name и avatar
7. В Supabase Dashboard → Authentication → Users — твой юзер появился
8. В Table Editor → `profiles` — заполнены `display_name` и `avatar_url`
9. В Table Editor → `streaming_connections` — есть строка с `provider='spotify'`, access_token, refresh_token, scopes
10. Tap "Log out" → возвращаешься на Sign In screen
11. Логинишься снова — попадаешь сразу в tabs (без повторного OAuth, потому что сессия в SecureStore. Если очистил storage — повторный OAuth, но Spotify теперь без consent screen — это нормально)
12. Тест refresh: вручную проставить `token_expires_at = now() - 1h`, вызвать `supabase functions invoke refresh-spotify-token --body '{"user_id":"<id>"}'` — `access_token` обновился, `token_expires_at` отодвинулся на час

---

## 3. Definition of Done — Фаза 2

- [ ] Spotify Developer app настроен: redirect URI = Supabase callback, я добавлен в Users
- [ ] Spotify provider включён в Supabase, Client ID/Secret сохранены
- [ ] Миграция `streaming_connections` применена, view `streaming_connections_safe` доступна из клиента
- [ ] `types/database.ts` обновлён вручную под миграцию или перегенерирован (`npm run db:types`) после `supabase link`
- [ ] Edge Function `upsert-streaming-connection` задеплоена и проходит smoke-тест
- [ ] Edge Function `refresh-spotify-token` задеплоена и обновляет токен в БД
- [ ] Spotify Client Secret лежит **только** в Supabase Edge Function secrets (не в репо, не в `.env.local`, не в Constants)
- [ ] Sign-in screen открывается для unauthenticated юзеров
- [ ] OAuth flow до конца работает на iPhone через Expo Go
- [ ] После логина видны display_name и avatar на Profile
- [ ] Logout возвращает на Sign-in и очищает сессию из SecureStore
- [ ] Повторный запуск приложения восстанавливает сессию (auto-login)
- [ ] `npm run lint` зелёный, `npm run typecheck` зелёный
- [ ] Коммит `feat(phase-2): spotify oauth + profile`

---

## 4. Что НЕ делаем в фазе 2 (явный non-scope)

- Импорт библиотеки альбомов (`/me/albums`) — фаза 3
- Spotify playlist чтение — фаза 3 (если решим включать)
- Любые UI для друзей — фаза 7
- Push, в т.ч. на смену юзера — фаза 6
- Quota Extension Request у Spotify — фаза 8 (перед публичным релизом)
- Перевод на dev build — фаза 4 или 6
- Сложная error UI (банеры, toast системы) — мы используем `Alert.alert`, этого хватит
- Multi-account support (несколько Spotify аккаунтов на одного юзера) — никогда, бизнес-логика этого не требует

---

## 5. Риски фазы 2 и митигации

| Риск | Митигация |
|---|---|
| Supabase OAuth redirect не пробивается обратно в Expo Go | Перепроверить redirect-схемы в Supabase Allow List: `exp://**`, точный `exp://.../--/auth/callback` из Metro лога и `albumoftheday://**` для будущих сборок. `AuthSession.makeRedirectUri({ path: 'auth/callback', native: 'albumoftheday://auth/callback' })` даёт `exp://.../--/auth/callback` в Expo Go и native scheme в dev/prod build |
| Expo Router перехватывает OAuth callback раньше `openAuthSessionAsync` | Использовать route `app/auth/callback.tsx`, который завершает `exchangeCodeForSession` и делает `syncSpotifyConnection`. Router guard должен пропускать сегмент `auth` без сессии |
| `provider_token` отсутствует в сессии после signInWithOAuth | Это бывает если в Dashboard выключен "Return tokens to client" или используется неподходящий flow type. Проверка: после `signInWithOAuth` в `session.provider_token` должна быть строка. Если null — Supabase разлогинить и пересоздать сессию |
| `provider_refresh_token` отсутствует при повторном логине | Это нормальный сценарий у OAuth-провайдеров: refresh token может вернуться только при первом consent. `upsert-streaming-connection` должен переиспользовать уже сохранённый refresh token |
| Клиент случайно читает токены из `streaming_connections` | Не добавлять `SELECT` policy на базовую таблицу. Клиент читает только `streaming_connections_safe`, где нет `access_token`/`refresh_token` |
| Spotify возвращает 403 на /me с правильным токеном | Скорее всего юзер не в списке Users and Access (Dev Mode limitation). Сообщение об ошибке в UI должно прямо это говорить |
| Spotify Client Secret попал в репо | До первого push: `git grep -i 'spotify_client_secret'` и `git log -p` — если попал, ротация через Spotify Dashboard "Reset Client Secret" |
| PKCE vs implicit flow путаница в Supabase JS | Использовать **последнюю стабильную версию** `@supabase/supabase-js` v2.x. Перед написанием кода Claude Code должен прочитать актуальные доки `signInWithOAuth` для React Native — API мог поменяться |
| Refresh token истёк (Spotify иногда инвалидирует через 6 мес inactivity) | UI должен обрабатывать: если refresh-function вернула 4xx — показать "Re-connect Spotify" с кнопкой повторного OAuth |
| `token_expires_at` в БД не синхронизирован с реальным | Edge Function `refresh-spotify-token` проверяет сама перед каждым обращением. В фазе 3 это станет критичным |
| App Tracking Transparency на iOS 14.5+ | Сейчас не требуется (мы не используем IDFA). Но в Info.plist может попасть строка от Sentry/analytics в фазе 6 — там и разберёмся |

---

## 6. Что я (юзер) делаю руками заранее

До запуска Claude Code:

1. **Spotify Dashboard:**
   - Войти на [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   - Если app ещё нет — Create app с именем `Album of the Day`, типом `Mobile`, описание любое
   - В Settings → Redirect URIs добавить `https://<supabase-ref>.supabase.co/auth/v1/callback`
   - Bundle ID: `com.pesnya.albumoftheday`
   - Users and Access → добавить свой Spotify email
   - Скопировать Client ID и Client Secret

2. **Supabase Dashboard:**
   - Authentication → Providers → Spotify → Enable
   - Вставить Client ID + Secret, Save
   - Authentication → URL Configuration:
     - Site URL: `albumoftheday://`
     - Redirect URLs: добавить `exp://**`, точный `exp://.../--/auth/callback` из Metro лога и `albumoftheday://**`
   - Edge Functions → Secrets → добавить `SPOTIFY_CLIENT_ID` и `SPOTIFY_CLIENT_SECRET`

3. **Локально:**
   - Если Supabase CLI ещё не залогинен (после фазы 1 могло остаться): `supabase login` → следовать инструкциям
   - Убедиться что `supabase link` ведёт на правильный project ref: `supabase status`

---

## 7. Точки обращения к Claude Code

Шаги слишком связаны чтобы дробить как фазу 1. Рекомендую **3 крупных задачи**:

1. _"Фаза 2, задачи 1: создай миграцию streaming_connections по plans/phase-2-spotify-auth.md шаг 3 и обнови types/database.ts. Покажи diff и остановись."_

2. _"Фаза 2, задачи 2: создай две Edge Functions (upsert-streaming-connection и refresh-spotify-token) по шагам 4–6. Перед написанием прочитай актуальные доки Supabase Functions Deno runtime и @supabase/supabase-js v2. Покажи код, я задеплою сам после ревью."_

3. _"Фаза 2, задачи 3: имплементируй клиентский слой (auth helpers, AuthProvider, sign-in screen, redirect guard, обновлённый profile) по шагам 7–11. Перед кодом перечитай актуальные доки Expo SDK 54 AuthSession и @supabase/supabase-js v2 — версии могли поменяться с момента написания плана. Покажи изменения по файлам."_

В каждой задаче явно проси: **"перед написанием кода прочитай актуальные доки X версии Y"**. Это критично для OAuth — поверхностные изменения SDK ломают потоки. Особенно `signInWithOAuth` и `expo-auth-session`.

---

## 8. Открытые вопросы (решаем по ходу)

- [ ] Реализуем ли "Disconnect Spotify" (delete from streaming_connections + sign out) или это считается "Log out"? — По умолчанию делаем "Log out" = и signOut, и сохраняем connection для re-login. Disconnect — отдельная кнопка позже
- [ ] Куда деть ошибки логина (Spotify сказал no, network failed): `Alert.alert` или собственный inline error? — В фазе 2 `Alert.alert`, в фазе 5 заменим на полноценную error UI
- [ ] Брендированная Spotify-кнопка с лого/цветом — точно по гайдлайнам или "достаточно похоже"? — В фазе 2 функциональная кнопка, к фазе 8 (App Store submission) приводим в строгое соответствие гайдлайнам

---

## 9. Ориентировочный тайминг

| Шаг | Время |
|---|---|
| 1 (Spotify Dashboard) | 15 мин |
| 2 (Supabase Spotify provider) | 10 мин |
| 3 (миграция) | 30 мин |
| 4 (Edge Functions infra) | 20 мин |
| 5 (upsert-streaming-connection) | 1 ч |
| 6 (refresh-spotify-token) | 45 мин |
| 7 (env + auth helpers) | 1 ч |
| 8 (AuthProvider) | 30 мин |
| 9 (защита роутов) | 30 мин |
| 10 (sign-in screen) | 45 мин |
| 11 (profile screen) | 1 ч |
| 12 (e2e проверка + отладка) | 2 ч |
| **Буфер на отладку OAuth/PKCE** | +100% (это самая багоопасная фаза) |

**Итого:** 16–20 часов чистого времени. Растягиваем на 1.5–2 недели по 1.5 ч в день.

**Почему такой большой буфер:** OAuth + deep links — классическая зона неожиданностей. Можно потратить полдня на одну редирект-URI которая не пробивается. Это нормально.

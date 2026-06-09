# Фаза 1 — Реализация: что по факту построено

> Этот документ описывает **как оно реализовано** — в отличие от `phase-1-skeleton.md`, который является планом.
> Статус: ✅ завершено (2026-05-23).
> SDK на момент закрытия фазы: **Expo SDK 54** (см. раздел 3 про дрейф 55 → 56 → 54).

---

## 1. Карта файлов

### Новые файлы

| Файл | Назначение |
|------|-----------|
| `app.config.ts` | Динамический Expo-конфиг, читает `EXPO_PUBLIC_*` из env и пробрасывает в `extra` |
| `app/_layout.tsx` | Root: `QueryClientProvider`, `SafeAreaProvider`, Sentry init, Stack |
| `app/(tabs)/_layout.tsx` | Tab bar с 4 табами (Home / Library / Friends / Profile) и иконками `@expo/vector-icons` |
| `app/(tabs)/index.tsx`, `library.tsx`, `friends.tsx`, `profile.tsx` | Экраны-заглушки |
| `app/+not-found.tsx` | 404 |
| `components/ui/Screen.tsx` | SafeArea + ScrollView wrapper, тёмная тема |
| `components/ui/Text.tsx` | Типографика, варианты h1/h2/body/caption |
| `components/ui/Button.tsx` | Pressable с вариантами primary/secondary/ghost, проп `title` (не `label`) |
| `components/PlaceholderCard.tsx` | Карточка-заглушка для пустых экранов |
| `lib/env.ts` | zod-валидация env, читает из `Constants.expoConfig?.extra` |
| `lib/supabase.ts` | Supabase client с SecureStore-адаптером |
| `lib/queryClient.ts` | TanStack Query config (`staleTime: 60s`, `retry: 2`) |
| `lib/sentry.ts` | No-op заглушка, активируется когда `@sentry/react-native` установлен и DSN задан |
| `types/database.ts` | Сгенерирован вручную под текущую миграцию `profiles` (до `supabase login`) |
| `supabase/config.toml` | Конфиг Supabase CLI |
| `supabase/migrations/20260523000000_initial_schema.sql` | Миграция `profiles` + триггер `handle_new_user` |
| `tailwind.config.js` | Token'ы цветов (`bg`, `surface`, `surface-2`, `text`, `muted`, `accent`) |
| `babel.config.js` | `babel-preset-expo` с `jsxImportSource: 'nativewind'` + `nativewind/babel` |
| `metro.config.js` | `withNativeWind(config, { input: './global.css' })` |
| `global.css` | `@tailwind base/components/utilities` (исключён из Biome) |
| `nativewind-env.d.ts` | Типы NativeWind для `className` на RN-компонентах |
| `biome.json` | Lint + format с `@biomejs/biome` 2.x (`recommended`, индент 2 пробела, line-width 100) |
| `.env.example` | Шаблон env (коммитится) |

### Изменённые файлы

| Файл | Что изменилось |
|------|---------------|
| `package.json` | Скрипты `lint/format/typecheck/db:*`, `main: "expo-router/entry"`, exact-пины `react@19.1.0` и `react-native@0.81.5` |
| `tsconfig.json` | `strict: true`, `noUncheckedIndexedAccess`, `paths: { "@/*": ["./*"] }`, include с `.expo/types` и `nativewind-env.d.ts` |
| `README.md` | Обновлён под итоговую структуру + список скриптов |
| `AGENTS.md` | Ссылка на v54-доки, заметка про проверку App Store Expo Go перед бампом SDK |

### Удалённые файлы

- `App.tsx` — заменён на entry через `expo-router/entry`
- `index.ts` — то же
- `app.json` — заменён динамическим `app.config.ts`

---

## 2. Технические решения (актуальные на момент завершения)

| Аспект | Выбор | Заметка |
|---|---|---|
| Expo SDK | **54** | Не 52/55/56 как в плане — продиктовано App Store Expo Go (раздел 3) |
| TypeScript | strict + `noUncheckedIndexedAccess` | Версия выровнена через `expo install --check` (5.9.x для SDK 54) |
| Lint/format | **Biome 2.4** | `npm run lint` / `format`; `global.css` исключён (Biome не знает `@tailwind`) |
| Роутинг | **expo-router 6** (file-based) | `(tabs)` группа, `_layout` на каждом уровне |
| Стилизация | **NativeWind 4 + Tailwind 3.4** | Tailwind 4 пока несовместим с NativeWind |
| Reanimated | **4.1.x** | Требует отдельный `react-native-worklets@0.5.x` |
| Server state | **TanStack Query 5** | Provider в `app/_layout.tsx` |
| Supabase client | **`@supabase/supabase-js` 2.x** | SecureStore-адаптер, `autoRefreshToken: true`, `detectSessionInUrl: false` |
| Env | **zod** через `app.config.ts` → `lib/env.ts` | Никогда `process.env.*` в app-коде |
| Error tracking | **Отложен** | sentry.io недоступен (403). Stub в `lib/sentry.ts` ждёт DSN |

---

## 3. Хронология реализации и дрейф SDK

Реализация шла не по плану линейно — было три SDK-перехода. Зафиксировано для будущей сверки:

| Коммит | Описание | SDK |
|--------|----------|-----|
| `74c5a8e` | `feat(phase-1)`: вся структура — tabs, NativeWind, Supabase, React Query, Sentry stub | 55 |
| `fa5f2a3` | `chore: bump to Expo SDK 56` | 56 |
| `865d4ea` | `chore: pin to Expo SDK 54 to match App Store Expo Go` | 54 |
| `2af31d2` | `fix: pin react and react-native to exact versions for SDK 54` | 54 |
| `bf9dd37` | `docs: capture working-on-this-codebase rules in CLAUDE.md` | 54 |

**Причина дрейфа:** Expo Go из App Store на момент работы поддерживал только SDK 54 (Profile → "Supported SDK"). npm latest был 56, но Apple ещё не одобрила соответствующую сборку Expo Go. Любой проект на 55+ давал ошибку *"Project requires a newer version of Expo Go"*.

**Урок для следующих фаз:** перед бампом SDK всегда сверяться с тем что отдаёт App Store. Если расходятся — оставаться на App Store-версии.

---

## 4. Pitfalls / отладочный лог

Все они материализованы как правила в `CLAUDE.md`. Здесь — контекст откуда они взялись.

### 4.1 `react` с caret → "Incompatible React versions"

`"react": "^19.1.0"` позволил npm взять `19.2.6`, а `react-native@0.81.5` ожидает **точно** `19.1.0` (renderer пинится при сборке RN). Рантайм-краш в `ReactNativeRenderer-dev.js`. Лечение: `npm install --save-exact react@19.1.0 react-native@0.81.5`.

### 4.2 Stray `node_modules` в `/Users/pesnya/`

Случайный `npm install expo` в домашней папке создал `/Users/pesnya/{package.json,package-lock.json,node_modules}` с SDK 56-пакетами. Node резолвит вверх по дереву, подменял проектные модули SDK 56-овскими. Симптом: `npm ls` показывает локально правильные версии, но Metro собирает с конфликтом. Лечение: удалить мусор из дома.

### 4.3 Reanimated 4 без `react-native-worklets`

В SDK 54 worklet-плагин вынесен в отдельный пакет. Без него Metro падает: *"Cannot find module 'react-native-worklets/plugin'"*. Лечение: `npx expo install react-native-worklets`.

### 4.4 ERESOLVE на `npm install`

NativeWind, Supabase и часть expo-плагинов имеют peer-зависимости которые ругаются на новый RN/React. Лечение: всегда `--legacy-peer-deps`.

### 4.5 Sandbox блоки

- `rm -rf` — запрещён даже с `dangerouslyDisableSandbox`. Юзер выполняет руками.
- `supabase` CLI пишет в `~/.supabase/telemetry.json` → блок. Запускать с `dangerouslyDisableSandbox`.
- `npm install` пишет в `~/.npm/_cacache` → то же.

### 4.6 SDK 56 vs 54 разница в `splash`

В SDK 56 удалён top-level `splash` field — нужен `expo-splash-screen` плагин. В SDK 54 работает и так, и так. Сейчас используем плагин — переносится без правок если когда-нибудь обновимся.

### 4.7 Sentry

`sentry-expo` из исходного плана — deprecated в SDK 50+. Правильный путь — `@sentry/react-native` с его Expo config-плагином. Но sentry.io отдаёт 403 (региональная блокировка). `lib/sentry.ts` оставлен как no-op заглушка, ждёт либо доступа, либо переключения на альтернативу (GlitchTip / PostHog обсуждались).

---

## 5. Definition of Done

Из `phase-1-skeleton.md` §3:

- [x] `npx expo start` запускается без ошибок
- [x] Приложение открывается в Expo Go на личном iPhone
- [x] Четыре таба (Home, Library, Friends, Profile) переключаются, каждый показывает заглушку
- [x] Тёмная тема, единый визуальный язык через NativeWind
- [x] `npm run lint` зелёный
- [x] TypeScript компилируется (`npx tsc --noEmit`) без ошибок
- [x] Supabase проект создан, миграция `initial_schema` применена (через Dashboard SQL Editor), таблица `profiles` видна в Dashboard
- [ ] ~~Sentry получает test event~~ — **отложено**, sentry.io недоступен; stub готов к активации
- [x] `.env.example` коммитится, `.env.local` — нет
- [x] README объясняет как поднять проект с нуля
- [x] Код в git, серия коммитов фазы 1 + три SDK-фикса
- [x] `types/database.ts` создан (вручную, до `supabase login` — соответствует миграции)

---

## 6. Что осталось дотянуть (не блокирует фазу 2)

1. **`supabase login` + `npm run db:types`.** Сейчас типы написаны руками и совпадают с миграцией. После логина в CLI типы будут автогенериться из живой БД — синхронизировать перед добавлением новых миграций в фазе 2.
2. **Sentry или альтернатива.** Решается в фазе 6 (полировка/бета), не блокирует фичевую разработку.
3. **Иконка и сплеш.** Сейчас дефолтные ассеты из `create-expo-app`. По плану — фаза 6/8.

---

## 7. Команды-шпаргалка

```bash
npm install --legacy-peer-deps          # установка (всегда с флагом)
npm run start                           # Expo Dev Server
npm run start -- --clear                # с очисткой Metro-кеша (после смены deps)
npm run lint                            # Biome
npm run format                          # Biome auto-fix
npm run typecheck                       # tsc --noEmit
npx expo install --check                # сверка версий пакетов с SDK
npx expo install --fix                  # авто-выравнивание (внутри ставит без --legacy-peer-deps, может упасть)

# Supabase (требует supabase login)
npm run db:push                         # отправить миграции в облако
npm run db:types                        # сгенерировать types/database.ts
npm run db:new <name>                   # создать новую миграцию
```

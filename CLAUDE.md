@AGENTS.md

# Working on this codebase

## Dependency rules (don't skip)

- **`npm install` must be run with `--legacy-peer-deps`.** Several deps (NativeWind, Supabase, etc.) have peer-dep conflicts with the Expo SDK's pinned RN/React. Plain `npm install` fails ERESOLVE.
- **Pin `react` and `react-native` to exact versions** (no `^`, no `~`). RN bundles its renderer locked to a specific React patch, so a caret range will let npm pick a newer 19.x and crash at runtime with "Incompatible React versions". When bumping either, use `npm install --save-exact`.
- **Before bumping Expo SDK**, open Expo Go on the device → Profile → "Supported SDK". App Store ships Expo Go behind npm by weeks. If npm has SDK 56 but App Store Expo Go reports SDK 54, the project must stay on 54 — otherwise the bundle loads to a "requires newer Expo Go" wall. Pin all `expo-*` packages to that SDK's matrix and use `npx expo install --check` to verify.
- **For SDK 54, `expo-auth-session` is bundled as `~7.0.11`.** Older notes that say "expo-auth-session v6" apply to SDK 53. Use the exact SDK 54 docs before touching OAuth, and verify with `npx expo install --check`.
- **Reanimated 4 needs `react-native-worklets` installed explicitly.** The babel worklet plugin moved out of `react-native-reanimated` in v4. Missing it surfaces as `Cannot find module 'react-native-worklets/plugin'` from `babel-preset-expo`.
- **Stray `node_modules` in any parent directory (e.g. `/Users/pesnya/node_modules`) will poison resolution** — Node walks up the tree. If you see version mismatch errors that `npm ls` can't explain, check parent dirs.
- In the Codex desktop shell, `node` may come from the app bundle while `npm`/`npx` live under `/opt/homebrew/bin`. If `npx` or nested `npm install` is missing, run commands with `PATH=/opt/homebrew/bin:$PATH`.

## Sandbox behavior

The Claude Code sandbox blocks a few things relevant to this repo:

- `rm -rf node_modules` — denied even with sandbox off. Ask the user to run it manually.
- `supabase` CLI — writes to `~/.supabase/telemetry.json`, blocked by default. Run with `dangerouslyDisableSandbox: true`.
- `npm install` writes to `~/.npm/_cacache` — same, needs sandbox off.
- Anything under `~/.ssh`, `~/.aws`, or `./.env*` is read-blocked.

## Supabase

- Schema lives in `supabase/migrations/`. Phase 1 ships only the `profiles` table + `handle_new_user` trigger.
- To regenerate types from the live DB: `supabase login` (interactive — user must do this), then `npm run db:types`.
- Until then, `types/database.ts` is hand-written to match the migration. If you change a migration, update the types file too.
- Service role keys never go in the app or repo. Only the `anon` key belongs in `.env.local`.
- Phase 2 adds `streaming_connections` for Spotify tokens. Do **not** grant client `SELECT` on the base table and do **not** add a `select_own` RLS policy there; that would expose `access_token` and `refresh_token`. Client code reads only `public.streaming_connections_safe`.
- Edge Functions under `supabase/functions/` use Deno and per-function `deno.json` import maps. They are excluded from the app `tsconfig.json`; validate them with Supabase/Deno tooling, not the Expo app `tsc`.
- `upsert-streaming-connection` and `refresh-spotify-token` have `verify_jwt = false` in `supabase/config.toml` because they handle CORS preflight and validate `Authorization` themselves. Keep that validation in the function code if changing them.
- Spotify refresh tokens may not be returned on every OAuth login. Preserve the existing DB refresh token when `provider_refresh_token` is absent.

## Conventions

- Path alias `@/*` resolves to repo root (see `tsconfig.json`).
- Styling via NativeWind v4 — Tailwind class names on RN components. Color tokens (`bg`, `surface`, `text`, `muted`, `accent`) live in `tailwind.config.js`; reach for them before introducing hex literals.
- `global.css` is intentionally excluded from Biome (`@tailwind` directives are unknown to its CSS linter).
- UI primitives in `components/ui/` (`Screen`, `Text`, `Button`) — extend these rather than touching `react-native` components directly in screens.
- Env reads go through `lib/env.ts` (zod-validated). Don't `process.env.*` in app code.
- Supabase Auth in React Native uses SecureStore, `detectSessionInUrl: false`, `flowType: 'pkce'`, and AppState-driven `startAutoRefresh` / `stopAutoRefresh` in `lib/supabase.ts`.
- OAuth callback handling lives in `lib/auth.ts` and `app/auth/callback.tsx`: PKCE callbacks use `exchangeCodeForSession(code)`, with `setSession` only as an implicit-flow fallback. Keep the explicit `auth/callback` path so Expo Router can finish deep links that arrive outside the `openAuthSessionAsync` promise.
- `components/ui/Button` takes `title`, not `label`. The Spotify sign-in button is a dedicated `components/auth/SpotifyButton.tsx`.

## Phase plans

`plans/phase-*.md` are the source of truth for scope, but treat the *tooling* sections as advisory — they were written against a specific SDK snapshot and drift quickly (e.g. `sentry-expo` is deprecated in SDK 50+, NativeWind v2 babel syntax differs from v4). Verify package names and versions against current SDK docs before installing.

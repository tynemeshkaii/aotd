@AGENTS.md

# Working on this codebase

## Dependency rules (don't skip)

- **`npm install` must be run with `--legacy-peer-deps`.** Several deps (NativeWind, Supabase, etc.) have peer-dep conflicts with the Expo SDK's pinned RN/React. Plain `npm install` fails ERESOLVE.
- **Pin `react` and `react-native` to exact versions** (no `^`, no `~`). RN bundles its renderer locked to a specific React patch, so a caret range will let npm pick a newer 19.x and crash at runtime with "Incompatible React versions". When bumping either, use `npm install --save-exact`.
- **Before bumping Expo SDK**, open Expo Go on the device → Profile → "Supported SDK". App Store ships Expo Go behind npm by weeks. If npm has SDK 56 but App Store Expo Go reports SDK 54, the project must stay on 54 — otherwise the bundle loads to a "requires newer Expo Go" wall. Pin all `expo-*` packages to that SDK's matrix and use `npx expo install --check` to verify.
- **Reanimated 4 needs `react-native-worklets` installed explicitly.** The babel worklet plugin moved out of `react-native-reanimated` in v4. Missing it surfaces as `Cannot find module 'react-native-worklets/plugin'` from `babel-preset-expo`.
- **Stray `node_modules` in any parent directory (e.g. `/Users/pesnya/node_modules`) will poison resolution** — Node walks up the tree. If you see version mismatch errors that `npm ls` can't explain, check parent dirs.

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

## Conventions

- Path alias `@/*` resolves to repo root (see `tsconfig.json`).
- Styling via NativeWind v4 — Tailwind class names on RN components. Color tokens (`bg`, `surface`, `text`, `muted`, `accent`) live in `tailwind.config.js`; reach for them before introducing hex literals.
- `global.css` is intentionally excluded from Biome (`@tailwind` directives are unknown to its CSS linter).
- UI primitives in `components/ui/` (`Screen`, `Text`, `Button`) — extend these rather than touching `react-native` components directly in screens.
- Env reads go through `lib/env.ts` (zod-validated). Don't `process.env.*` in app code.

## Phase plans

`plans/phase-*.md` are the source of truth for scope, but treat the *tooling* sections as advisory — they were written against a specific SDK snapshot and drift quickly (e.g. `sentry-expo` is deprecated in SDK 50+, NativeWind v2 babel syntax differs from v4). Verify package names and versions against current SDK docs before installing.

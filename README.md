# Album of the Day

> Один день. Один альбом. Без бесконечной ленты, радио и плейлистного шума.

An iOS-first music ritual. Every local morning you get **one** full album that
isn't already in your library, chosen around your taste and listening history.
Open it in Spotify. Sit with it. Rate it in five honest words. Build a quiet
archive of records you actually heard.

No infinite feed. No genre boxes. No skip button. No social pressure.

---

## What it does

- **One pick per local calendar day.** No catch-up backlog, no streaks to game.
- **Editorial album surface** — full-bleed cover, parallax, a short human "why
  this album?" line, a country chip, and a Spotify deep link that respects
  Free accounts.
- **Five-label rating journal.** *Loved it · Liked it · It was alright · Not for
  me · Bad.* Private by default, never fed back into the algorithm.
- **Discoveries archive** of everything you've been served, filterable by
  Waiting / Rated.
- **Profile as a listening identity** — Taste map, decade shelf, listening
  summary, library status, manual sync.
- **Share card** rendered to PNG via `react-native-view-shot`, so a discovery
  can leave the app as an image, not a link.

### What it explicitly is *not*

- Not a streaming app — Spotify owns playback.
- Not a recommendation feed — one pick, no carousel.
- Not a genre engine — the algorithm doesn't explain itself with taxonomy.
- Not a social network (yet) — v1 is solo, by design.

---

## Stack

| Layer | Choice |
| --- | --- |
| App | Expo SDK 54 · React Native 0.81.5 · React 19 · TypeScript strict |
| Routing | `expo-router` v6, bottom tabs: **Home · Discoveries · Profile** |
| Styling | NativeWind v4 · editorial PRESS skin (paper/ink, `#ff4a2e` accent) |
| Motion | Reanimated 4 + `react-native-worklets`, Reduce-Motion aware |
| Server state | TanStack Query v5 |
| Backend | Supabase Postgres + Auth + Edge Functions (Deno) |
| Auth | Spotify OAuth (PKCE) → Supabase session in AsyncStorage |
| Music provider | Spotify (Web API + deep links) |
| Metadata / signals | Last.fm, MusicBrainz (artist country, release-group filters) |
| Lint / format | Biome |

---

## Architecture, 60 seconds

```
app/                     thin Expo Router screens
├── (tabs)/              Home · Discoveries · Profile
├── auth/                Spotify OAuth + callback
└── discoveries/[id]     archive detail

components/
├── skins/
│   ├── shared/          behavior controllers (data, navigation, share, rating)
│   └── editorial/       the editorial PRESS presentation skin
└── ui/                  Screen · Text · Button · Card · Badge · Avatar …

lib/                     supabase client, auth, env, query hooks, navigation
                         chrome, motion, haptics, recommendation helpers
theme/                   skin registry, fonts, accent flow
supabase/
├── migrations/          schema, RLS, grants, RPCs, observability views
└── functions/           Deno edge functions
                         (compute-album-of-the-day, dispatch-daily-picks,
                          sync-spotify-library, prewarm-*, refresh-spotify-token)
types/database.ts        regenerated from the linked Supabase project
```

Route files stay thin. Behavior lives in **shared controllers**, presentation
in the **editorial skin**, tokens in `theme/colors.js` and
`components/skins/shared/skinStyles.ts`. The recommendation pipeline is
**cache-first, service-role only**, with rate-limit slots and circuit breakers
guarding every external API.

A deeper map of the codebase — product invariants, DB contracts, the
recommendation pipeline, the editorial skin system, OAuth/sync semantics —
lives in [`AGENTS.md`](AGENTS.md). Treat it as the source of truth, ahead of
this file.

---

## Getting started

### Requirements

- Node.js 20+
- Expo Go on a physical iPhone (SDK 54 must be supported by your installed
  Expo Go — check Profile → Supported SDK before upgrading)
- A Supabase project + Spotify developer app for OAuth

### Install

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
# Spotify client id, and optional Sentry DSN
```

> `--legacy-peer-deps` is mandatory. `react` / `react-native` are pinned exact.

### Run

```bash
npm run start -- --go     # Expo Go
npm run ios               # iOS simulator
```

---

## Scripts

```bash
npm run start       expo start
npm run ios         expo start --ios
npm run android     expo start --android
npm run web         expo start --web
npm run lint        biome check
npm run format      biome format --write
npm run typecheck   tsc --noEmit (app only; Deno fns excluded)
npm run db:new      supabase migration new <name>
npm run db:push     supabase db push    (apply migrations)
npm run db:types    regenerate types/database.ts from the linked DB
make check          lint + typecheck
```

After applying migrations, **always regenerate types** so the app sees the
live schema:

```bash
npm run db:push && npm run db:types
```

Edge functions deploy individually:

```bash
supabase functions deploy compute-album-of-the-day
```

---

## How a pick is made

1. **Daily dispatcher** (`dispatch-daily-picks`, cron) finds users approaching
   local midnight and calls `compute-album-of-the-day` per user.
2. **Compute** reads the user's cached candidate pool
   (`recommendation_candidates`), excludes their library + recommendation
   history (Spotify id, MusicBrainz release-group id, normalized artist+album).
3. **Late Spotify binding**: build a bounded text pool → pre-score → resolve
   only the top K through `resolveSpotifyAlbumCached`. No broad Spotify Search
   in the hot path.
4. **Eligibility filter**: no one-track singles, no compilations, no live /
   soundtrack / remix / DJ-mix release groups. EP-like singles allowed.
5. **Scoring** is algorithm version 2. Algorithm 3 runs in **shadow** and writes
   to `aotd_shadow_picks` for offline comparison only.
6. **Country chip**: MusicBrainz artist lookup, fail-open to null, cached in
   `mb_artist_cache`.
7. **External API discipline** everywhere: DB-backed rate-limit slots,
   circuit breakers (Spotify Search is fail-closed), normalized endpoint
   logging, no raw URLs or tokens in logs.

The algorithm reads `user_library` and recommendation history.
**Ratings never feed back into scoring** — they are a private journal and the
input for sharing, not tuning.

---

## Product invariants

These are load-bearing. If you change one, update [`AGENTS.md`](AGENTS.md) too.

- UI copy is English-only in v1. No i18n, no Russian strings in the app.
- Tabs are **Home / Discoveries / Profile**. No Library, Friends, or Stats tabs.
- The Spotify **library import backend is essential** to recommendations even
  though the Library tab is gone.
- No skip mechanic. `albums_of_the_day.status` is `pending | opened | rated`.
- Ratings are the five emotional labels above, mapped to scores 5..1.
- "Why this album?" is mandatory, short, human, low-pressure.
- Spotify Free users get a soft badge and a one-time explainer before opening
  Spotify.
- Share is file-first: prefetch the cover, render a PNG, then hand off to the
  OS share sheet.

---

## Roadmap

- **v1 (now)** — solo daily ritual, ratings journal, Discoveries archive,
  editorial skin, share card, Spotify Free explainer, MusicBrainz country chip,
  shadow algorithm v3.
- **Next** — push notifications at the user's chosen local time, account
  deletion, richer Profile listening summary.
- **Later** — lightweight social layer (friends' activity), App Store release,
  additional music providers.

Active planning lives in [`plans/`](plans/). Treat plan files with explicit
*Done / locked decision* sections as current; older phase plans are historical
intent.

---

## Development notes

- Expo SDK 54 is intentional — it keeps the project compatible with Expo Go on
  a physical iPhone during early development. Verify your device's Expo Go
  supported-SDK list before any SDK bump.
- `.env*` is read-blocked for the assistant and ignored by git. Commit only
  `.env.example`. Service-role keys never ship in the app.
- Clients read tokens only through `streaming_connections_safe`, never the
  base `streaming_connections` table.
- If NativeWind / font config changes, clear Metro cache:
  `npx expo start -c`.

---

## License

Private project during early development.

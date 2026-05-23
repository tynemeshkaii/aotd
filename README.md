# Album of the Day

> Один день. Один альбом. Без бесконечной ленты, радио и плейлистного шума.

Album of the Day is an iOS-first music discovery app built around a simple daily ritual: every morning you get one full album that is not already in your library, selected around your taste and listening history.

The MVP focuses on Spotify integration, a personal album-of-the-day recommendation loop, ratings, notes, and later a lightweight social layer for friends' listening activity.

## Status

The project is in **Phase 1: App Skeleton**.

Current baseline:

- Expo SDK 56 + React Native + TypeScript (strict)
- `expo-router` with four tabs: Home, Library, Friends, Profile
- NativeWind v4 with dark theme + UI primitives (`Screen`, `Text`, `Button`, `PlaceholderCard`)
- Supabase client wired with `expo-secure-store` session adapter
- TanStack Query provider at root
- Biome for lint + format
- `zod`-validated env via `app.config.ts` → `lib/env.ts`
- Initial Supabase migration for `profiles` (lives in `supabase/migrations/`)
- Sentry stub — activates when `EXPO_PUBLIC_SENTRY_DSN` is set and `@sentry/react-native` is installed

Pending Phase 1 work:

- Apply Supabase migration (run `supabase login`, then `npm run db:push` and `npm run db:types`)
- Wire real Sentry once a DSN is available

## Product Idea

Streaming apps are very good at keeping you inside familiar listening loops. Album of the Day is for people who still want the feeling of discovering a whole record: the sequencing, the cover, the era, the context, the opinion after listening.

The core loop:

1. Receive a daily album recommendation.
2. Open the album card.
3. Listen in Spotify.
4. Return to rate it from 1 to 10.
5. Build a personal history of discovered albums.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Mobile app | Expo, React Native, TypeScript |
| Runtime target | iOS first, Expo Go during early development |
| Backend | Supabase: Postgres, Auth, Edge Functions |
| Routing | expo-router |
| Styling | NativeWind |
| Server state | TanStack Query |
| Error tracking | Sentry |
| Music provider MVP | Spotify |
| Metadata and signals | Last.fm, MusicBrainz, later Discogs |

## Getting Started

### Requirements

- Node.js 20 or newer
- npm
- Expo Go on an iPhone

### Install

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, optional SENTRY DSN
```

### Run

```bash
npm run start -- --go
```

Then scan the QR code with Expo Go.

## Scripts

```bash
npm run start       # expo start
npm run ios         # expo start --ios
npm run android     # expo start --android
npm run web         # expo start --web
npm run lint        # biome check
npm run format      # biome format --write
npm run typecheck   # tsc --noEmit
npm run db:push     # supabase db push (requires supabase login)
npm run db:types    # regenerate types/database.ts from linked project
npm run db:new      # create a new migration file
```

## Project Structure

```text
.
├── app/
│   ├── _layout.tsx              # QueryClientProvider + Stack + Sentry init
│   ├── +not-found.tsx
│   └── (tabs)/
│       ├── _layout.tsx          # Tab bar (Home / Library / Friends / Profile)
│       ├── index.tsx
│       ├── library.tsx
│       ├── friends.tsx
│       └── profile.tsx
├── components/
│   ├── ui/                      # Screen, Text, Button
│   └── PlaceholderCard.tsx
├── lib/
│   ├── env.ts                   # zod-validated environment
│   ├── queryClient.ts
│   ├── sentry.ts
│   └── supabase.ts
├── supabase/
│   ├── config.toml
│   └── migrations/
├── types/
│   └── database.ts              # regenerate with `npm run db:types`
├── app.config.ts
├── babel.config.js
├── biome.json
├── global.css
├── metro.config.js
└── tailwind.config.js
```

## Roadmap

- **Phase 1:** app skeleton, tabs, theme, Supabase, Sentry
- **Phase 2:** Spotify auth and profile
- **Phase 3:** Spotify library import
- **Phase 4:** album recommendation algorithm
- **Phase 5:** album card, Spotify deep link, ratings and notes
- **Phase 6:** polish, analytics, push notifications, closed beta
- **Phase 7+:** social layer, App Store release, additional providers

The detailed roadmap lives in [`plans/master-plan.md`](plans/master-plan.md).

## Development Notes

- Expo SDK 56 is intentional for now: it keeps the app compatible with Expo Go on a physical iPhone during early development.
- Environment files are ignored by git. Commit `.env.example`, never local secrets.
- Supabase service role keys must never be shipped to the app or committed to the repository.

## License

Private project during early development.

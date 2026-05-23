# Album of the Day

> Один день. Один альбом. Без бесконечной ленты, радио и плейлистного шума.

Album of the Day is an iOS-first music discovery app built around a simple daily ritual: every morning you get one full album that is not already in your library, selected around your taste and listening history.

The MVP focuses on Spotify integration, a personal album-of-the-day recommendation loop, ratings, notes, and later a lightweight social layer for friends' listening activity.

## Status

The project is in **Phase 1: App Skeleton**.

Current baseline:

- Expo + React Native + TypeScript app scaffolded
- Expo SDK 55 selected for Expo Go compatibility on iPhone
- Git repository initialized
- Product and technical plans committed in [`plans/`](plans/)

Next Phase 1 milestones:

- `expo-router` with four placeholder tabs: Home, Library, Friends, Profile
- NativeWind theme and reusable UI primitives
- Supabase client and initial `profiles` schema
- React Query setup
- Sentry error tracking

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
npm install
```

### Run

```bash
npm run start -- --go
```

Then scan the QR code with Expo Go.

For local-only Metro verification:

```bash
npm run start -- --localhost
```

## Scripts

```bash
npm run start
npm run ios
npm run android
npm run web
```

More scripts will be added as Phase 1 introduces linting, formatting, type checking, Supabase migrations, and generated database types.

## Project Structure

Current scaffold:

```text
.
├── App.tsx
├── app.json
├── assets/
├── index.ts
├── package.json
├── plans/
└── tsconfig.json
```

Target Phase 1 structure:

```text
.
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
├── components/
├── lib/
├── supabase/
├── types/
└── plans/
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

- Expo SDK 55 is intentional for now: it keeps the app compatible with Expo Go on a physical iPhone during early development.
- Environment files are ignored by git. Commit `.env.example`, never local secrets.
- Supabase service role keys must never be shipped to the app or committed to the repository.

## License

Private project during early development.

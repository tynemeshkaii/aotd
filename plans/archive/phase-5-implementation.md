# Phase 5 implementation — Album Detail, Ratings, Discoveries, Share

Date: 2026-05-26

## What was built

Phase 5 closes the v1 solo loop: users can see today's album, understand why it was picked, open it in Spotify, save a private rating/note, revisit recommendation history in Discoveries, open historical album details, and share a generated album card.

### Database migration

| Migration | Purpose |
|---|---|
| `20260527000000_phase5_ratings_and_discoveries.sql` | Adds `ratings`, Phase 5 read/write RPCs, rating-aware `get_current_pick`, and status transition support for `pending -> rated` |
| `20260527010000_phase5_manual_qa_fixes.sql` | Patches already-applied Phase 5 projects after manual QA; redefines `save_album_rating` with explicit conflict constraint handling |

New table:

```sql
public.ratings (
  id uuid primary key,
  user_id uuid references auth.users on delete cascade,
  album_id uuid references public.albums on delete cascade,
  album_of_the_day_id uuid references public.albums_of_the_day on delete set null,
  score integer check (score between 1 and 5),
  comment text,
  is_public boolean default false,
  created_at timestamptz,
  updated_at timestamptz,
  unique (user_id, album_id)
)
```

Indexes:

- `ratings_user_updated_idx`
- `ratings_user_score_idx`
- `ratings_aotd_idx`

RLS/grants:

- Authenticated clients can `select` their own ratings.
- Authenticated clients do **not** get direct `insert`/`update` grants on `ratings`; writes go through `save_album_rating`.
- `ratings.is_public` is forced to `false` by the update trigger and RPC path. Public/social ratings remain out of scope for v1.

### RPCs

| RPC | Caller | Behavior |
|---|---|---|
| `get_current_pick(p_user_id)` | Home / `useTodayPick` | Returns today's album joined with optional rating fields |
| `get_discoveries(p_user_id)` | Discoveries tab | Returns all owned picks ordered by pick date desc, joined with optional rating fields |
| `get_discovery_detail(p_user_id, p_aotd_id)` | `/discoveries/[aotdId]` | Returns one owned pick by AOTD id |
| `save_album_rating(p_user_id, p_aotd_id, p_score, p_comment)` | `useSaveRating` | Validates ownership, upserts a private rating, sets AOTD status to `rated`, returns saved row |

Important migration detail: `get_current_pick(uuid)` changes its return shape from Phase 4, so the migration first drops the old function before recreating it. Do not convert this back to plain `create or replace function`; PostgreSQL rejects return-type changes without `drop function`.

`save_album_rating` uses `on conflict on constraint ratings_user_id_album_id_key` instead of `on conflict (user_id, album_id)`. Keep the explicit constraint form: PL/pgSQL output parameters named `user_id`/`album_id` can make unqualified conflict target references ambiguous in live RPC execution.

### Client data layer

| File | Purpose |
|---|---|
| `lib/recommendation.ts` | Shared `AlbumDiscovery`, `RatingScore`, `AotdStatus`, rating labels, Spotify URI/URL helpers, duration formatting, status labels |
| `lib/hooks/useDiscoveries.ts` | React Query fetch + Realtime invalidation for `albums_of_the_day` and `ratings` |
| `lib/hooks/useDiscoveryDetail.ts` | Detail fetch + Realtime invalidation |
| `lib/hooks/useSaveRating.ts` | Calls `save_album_rating`, invalidates Home/Discoveries/detail queries, shows one-time rating microcopy |
| `lib/hooks/useOpenAlbum.ts` | Opens Spotify app URI when available, falls back to web URL, then marks `pending -> opened` without blocking playback |
| `lib/hooks/useSpotifyFreeExplainer.ts` | Reads `streaming_connections_safe.spotify_product` and shows the one-time Free/Open Spotify explainer |

Realtime channel names include `useId()` per hook instance. Keep that pattern for any new hooks that subscribe to the same table from multiple components.

### UI and navigation

| File / folder | Purpose |
|---|---|
| `components/album/` | Shared album-detail components: hero, actions, why-this block, rating editor, share card, Discoveries list row, status tabs |
| `app/(tabs)/index.tsx` | Home renders `AlbumDetail` for today's pick and a low-pressure pending-history hint |
| `app/(tabs)/discoveries.tsx` | Recommendation history with `All / Pending / Rated` tabs and explicit error/empty states |
| `app/discoveries/[aotdId].tsx` | Historical detail route with deep-link-safe back behavior |
| `app.config.ts` | Adds iOS `LSApplicationQueriesSchemes: ['spotify']` so native Spotify URI checks work |

`AlbumDetail` is the shared surface for Home and historical detail. Keep the mandatory "Why this album" block in this shared component so Home and Discoveries cannot drift.

Manual QA changed the detail back affordance to always route to Discoveries with `router.replace('/(tabs)/discoveries')`; do not use `router.back()` there unless the app starts preserving source tab/filter state deliberately.

## Core flows

### Open in Spotify

1. Build `spotify:album:{album_spotify_id}` and `https://open.spotify.com/album/{album_spotify_id}`.
2. Try `Linking.canOpenURL` for the Spotify URI. If the check fails or returns false, use the web URL.
3. Call `Linking.openURL`.
4. If the row is still `pending`, update `albums_of_the_day.status` to `opened`.
5. If the status update fails, log only; Spotify opening should not be blocked by DB status bookkeeping.

### Save rating

1. User chooses one of five word labels:
   - `Loved it` -> `5`
   - `Liked it` -> `4`
   - `It was alright` -> `3`
   - `Not for me` -> `2`
   - `Bad` -> `1`
2. Optional private note is trimmed server-side; empty string becomes `null`.
3. `save_album_rating` validates `auth.uid() = p_user_id`, finds the owned AOTD row, upserts rating by `(user_id, album_id)`, and sets status to `rated`.
4. The DB trigger allows `pending -> rated` and sets `opened_at` when needed.
5. First successful save shows: "Saved to your journal. Your library shapes tomorrow's pick, not your ratings — keep saving in Spotify."

Ratings are journal data only. The recommendation algorithm continues to read only `user_library` and `recommendation_history`.

The one-time microcopy flag is stored in Expo SecureStore with an underscore-only key (`aotd_rating_microcopy_shown_{userId}`). SecureStore failures are caught and logged so a successful RPC write cannot be reported as a failed rating save.

### Share album card

1. `ShareCard` is mounted offscreen and captured with `react-native-view-shot`.
2. Album cover is prefetched before capture when a cover URL exists.
3. On iOS, React Native `Share.share` is used so the share payload can include the PNG plus text/Spotify URL.
4. On other platforms, `expo-sharing.shareAsync` shares the generated PNG file; the Spotify URL is still rendered inside the image and used as the dialog title where supported.

Dependencies already exist in `package.json`:

- `expo-sharing`
- `react-native-view-shot`

If reinstalling, use:

```bash
PATH=/opt/homebrew/bin:$PATH npx expo install expo-sharing react-native-view-shot -- --legacy-peer-deps
```

## Important constraints

- Do not add skip/listened states. AOTD status remains `pending | opened | rated`.
- Do not make ratings public or feed them into recommendations without an explicit plan change.
- Do not add direct client writes to `ratings`; use `save_album_rating`.
- Do not expose `streaming_connections` base table. Free/Premium detection reads only `streaming_connections_safe`.
- Do not recreate Library/Friends/Stats tabs or deleted Library UI files.
- Keep all v1 UI copy in English.

## Verification

Automated checks run locally:

```bash
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npx expo config --type public
```

`supabase db lint --local` could not run in this session because local Supabase Postgres was not listening on `127.0.0.1:54322`.

After applying the migration to the linked project, run:

```bash
PATH=/opt/homebrew/bin:$PATH npm run db:push
PATH=/opt/homebrew/bin:$PATH npm run db:types
```

`db:push` must happen first so the new table/RPCs exist in Supabase; `db:types` must run after that to replace the temporary hand-edited `types/database.ts` with generated truth from the live schema.

Manual QA checklist:

- Home renders today's album via shared `AlbumDetail`.
- The "Why this album" block appears on Home and historical detail.
- Open in Spotify opens the app when installed and falls back to web when not installed.
- Opening a pending album marks it `opened`.
- Saving each rating label stores the expected integer.
- Rating directly from `pending` works and sets status to `rated`.
- Editing a rating updates the same row.
- First rating microcopy appears once per user.
- Free/Open Spotify explainer appears once per user.
- Discoveries `All / Pending / Rated` tabs filter correctly.
- Historical detail route loads by `aotdId`.
- Share opens the native share sheet with a nonblank generated card.
- Discoveries/detail show explicit retry states on RPC/network errors.

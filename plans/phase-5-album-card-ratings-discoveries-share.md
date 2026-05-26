# Phase 5 — Album Card, Ratings, Discoveries, Share

> Goal: close the v1 solo core loop end-to-end. A user sees today's album, understands why it was picked, opens it in Spotify, rates it as a private journal entry, revisits past discoveries, and shares a generated album card through the native iOS Share Sheet.

**Status:** implemented in working tree  
**Depends on:** Phase 4 recommendation schema/RPCs already applied  
**Chosen UI direction:** A. Shared Album Detail

---

## 1. Product Decisions

- Phase 5 uses one shared album-detail surface for both Home and historical Discoveries.
- Home stays focused on today's album. Discoveries is the history/backlog.
- Discoveries gets status tabs: `All / Pending / Rated`. No search in Phase 5.
- Ratings are editable private journal entries, not immutable verdicts.
- Ratings do not feed the recommendation algorithm. The algorithm continues reading only `user_library` and `recommendation_history`.
- No skip mechanic. No `listened` status. No social graph. No public ratings UI.
- Share uses native iOS Share Sheet with a generated PNG and Spotify link/text where supported. No custom Instagram/Telegram/iMessage branches in Phase 5.
- All user-facing UI copy is English.

---

## 2. Database and API

### 2.1. Add `ratings`

Create a new migration, e.g.:

`supabase/migrations/20260527000000_phase5_ratings_and_discoveries.sql`

Add `public.ratings`:

```sql
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  album_of_the_day_id uuid references public.albums_of_the_day(id) on delete set null,
  score integer not null check (score between 1 and 5),
  comment text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, album_id)
);
```

Indexes:

- `ratings_user_updated_idx` on `(user_id, updated_at desc)`.
- `ratings_user_score_idx` on `(user_id, score)` for future Profile summaries.
- `ratings_aotd_idx` on `album_of_the_day_id` where not null.

RLS:

- Enable RLS.
- Revoke all from `anon, authenticated`.
- Grant `select, insert, update` to `authenticated`.
- `select_own`: `auth.uid() = user_id`.
- `insert_own_private`: `auth.uid() = user_id and is_public = false`.
- `update_own_private`: `auth.uid() = user_id and is_public = false`.
- No delete policy in v1 unless explicitly needed later.

Trigger:

- Add `touch_rating_updated_at()` before update.
- Optional guard: clients cannot set `is_public = true` in v1.

### 2.2. Add discovery read RPC

Add `public.get_discoveries(p_user_id uuid)` returning rows joined from:

- `albums_of_the_day`
- `albums`
- left join `ratings` by `user_id + album_id`

Returned shape:

```ts
type DiscoveryAlbum = {
  aotd_id: string;
  pick_date: string;
  status: 'pending' | 'opened' | 'rated';
  is_fallback: boolean;
  fallback_reason: string | null;
  selection_reason: SelectionReasonV1;
  opened_at: string | null;
  album_id: string;
  album_title: string;
  album_primary_artist_name: string;
  album_cover_url: string | null;
  album_spotify_id: string;
  album_release_year: number | null;
  album_total_tracks: number | null;
  album_duration_ms: number | null;
  rating_id: string | null;
  rating_score: 1 | 2 | 3 | 4 | 5 | null;
  rating_comment: string | null;
  rating_created_at: string | null;
  rating_updated_at: string | null;
};
```

Rules:

- Security definer.
- Verify `auth.uid() = p_user_id`.
- Return `order by aotd.date desc`.
- Do not expose ratings from other users.

### 2.3. Add detail read RPC

Add `public.get_discovery_detail(p_user_id uuid, p_aotd_id uuid)`.

Rules:

- Same returned shape as one `DiscoveryAlbum`.
- Verify owner with `auth.uid() = p_user_id`.
- Used by `app/discoveries/[aotdId].tsx` so the detail route can deep load a historical pick.

### 2.4. Add rating save RPC

Add `public.save_album_rating(...)`:

Inputs:

- `p_user_id uuid`
- `p_aotd_id uuid`
- `p_score integer`
- `p_comment text default null`

Behavior:

- Verify `auth.uid() = p_user_id`.
- Find the owned `albums_of_the_day` row.
- Upsert `ratings` on `(user_id, album_id)` with:
  - `score = p_score`
  - `comment = nullif(trim(p_comment), '')`
  - `album_of_the_day_id = p_aotd_id`
  - `is_public = false`
  - `updated_at = now()`
- Update the AOTD row to `status = 'rated'`.
- Do not mutate recommendation tables.
- Return the saved rating row fields.

Important implementation detail:

- The existing `aotd_guard_client_update()` allows `opened -> rated`, but currently rejects `pending -> rated`. Phase 5 requires "user can rate from any stage", so update the trigger to allow `pending -> rated` and set `opened_at = now()` when status becomes `rated` from `pending`.

### 2.5. Current pick should include rating data

Update `get_current_pick(p_user_id)` or introduce `get_current_pick_with_rating(p_user_id)` so Home can render the same detail surface as Discoveries.

Preferred: update `get_current_pick` to include the rating columns above. This preserves one query for Home and keeps the shared component simple.

### 2.6. Types

After applying migrations:

```bash
PATH=/opt/homebrew/bin:$PATH npm run db:push
PATH=/opt/homebrew/bin:$PATH npm run db:types
```

If Supabase CLI/login is unavailable, temporary hand-written `types/database.ts` updates are acceptable, but must be regenerated after the migration lands in the linked project.

---

## 3. Client Data Layer

### 3.1. Extend album model

Replace/extend `TodayPick` in `lib/recommendation.ts` into a shared model:

- `AlbumDiscovery`
- `RatingScore = 1 | 2 | 3 | 4 | 5`
- `AotdStatus = 'pending' | 'opened' | 'rated'`

Keep `SelectionReasonV1` and `formatSelectionReason`.

Add helpers:

- `RATING_OPTIONS`: label + score mapping
  - `Loved it` -> `5`
  - `Liked it` -> `4`
  - `It was alright` -> `3`
  - `Not for me` -> `2`
  - `Bad` -> `1`
- `formatAlbumDuration(durationMs)`
- `spotifyAlbumUri(spotifyId)`
- `spotifyAlbumUrl(spotifyId)`
- `getRatingLabel(score)`
- `getDiscoveryStatusLabel(row)`

### 3.2. Hooks

Add:

- `lib/hooks/useDiscoveries.ts`
  - calls `get_discoveries`
  - query key `['discoveries', userId]`
  - realtime invalidation on `albums_of_the_day` and `ratings`
  - channel names include `useId()` to avoid Supabase channel reuse conflicts

- `lib/hooks/useDiscoveryDetail.ts`
  - calls `get_discovery_detail`
  - query key `['discovery-detail', userId, aotdId]`
  - realtime invalidation on the same two tables

- `lib/hooks/useSaveRating.ts`
  - calls `save_album_rating`
  - invalidates:
    - `['today-pick', userId]`
    - `['discoveries', userId]`
    - `['discovery-detail', userId, aotdId]`
  - shows the one-time rating microcopy after the first successful save

- `lib/hooks/useOpenAlbum.ts` or plain helper mutation
  - when opening Spotify, update AOTD `pending -> opened`
  - do nothing if already `opened` or `rated`
  - do not block opening Spotify if the status update fails; show a soft alert/log only

### 3.3. Local one-time flags

Use existing `expo-secure-store`; do not add AsyncStorage just for Phase 5.

Keys:

- `aotd:rating-microcopy-shown:{userId}`
- `aotd:spotify-free-explainer-dismissed:{userId}`

Microcopy after first rating:

> Saved to your journal. Your library shapes tomorrow's pick, not your ratings — keep saving in Spotify.

Free Spotify explainer:

> Free Spotify may shuffle albums instead of playing them in order. Premium usually keeps the record behaving like a record.

---

## 4. UI and Navigation

### 4.1. Route structure

Keep current tabs:

- `app/(tabs)/index.tsx`
- `app/(tabs)/discoveries.tsx`
- `app/(tabs)/profile.tsx`

Add:

- `app/discoveries/[aotdId].tsx`

Do not recreate:

- `library.tsx`
- `friends.tsx`
- `stats.tsx`

### 4.2. Shared components

Create `components/album/`:

- `AlbumDetail.tsx`
  - the shared detail surface for Home and detail route
  - props: `album: AlbumDiscovery`, optional `isToday`

- `AlbumHero.tsx`
  - cover art, title, artist, release year
  - duration and track count
  - fallback image state if cover is missing

- `WhyThisAlbum.tsx`
  - renders mandatory "Why this album" block
  - uses `formatSelectionReason`
  - no genre-taxonomy language

- `AlbumActions.tsx`
  - Open in Spotify
  - Share
  - optional disabled/loading states

- `RatingEditor.tsx`
  - five word buttons
  - optional private note input
  - save/update button
  - no numeric sliders, star pickers, or emoji-primary UI

- `ShareCard.tsx`
  - hidden/offscreen capture target for `react-native-view-shot`
  - dimensions stable enough for social shares
  - large cover, artist, album, year, subtle `via Album of the Day`

- `DiscoveryListItem.tsx`
  - thumbnail, title, artist, date, status/rating label

- `StatusTabs.tsx`
  - `All / Pending / Rated`

### 4.3. Home

Update `app/(tabs)/index.tsx`:

- If loading: keep quiet/loading state.
- If no pick: render `WaitingForPick`.
- If pick: render `AlbumDetail album={pick} isToday`.
- Show "unrated discoveries" hint below the card if there are old pending discoveries.

The hint should be low-pressure:

> A few past picks are still waiting whenever you are.

Tap opens Discoveries filtered to Pending if routing state is straightforward; otherwise opens Discoveries and leaves filter at Pending via local param.

### 4.4. Discoveries

Update `app/(tabs)/discoveries.tsx`:

- Fetch `useDiscoveries`.
- Render status tabs.
- Filter locally:
  - `All`: all rows
  - `Pending`: rows with `status !== 'rated'`
  - `Rated`: rows with `status === 'rated'`
- Sort order comes from RPC (`date desc`).
- Empty overall state keeps current message:
  - "Your first discovery is coming"
- Empty filtered state:
  - Pending: "Nothing waiting. Suspiciously responsible."
  - Rated: "No journal entries yet."
- Row tap routes to `/discoveries/[aotdId]`.

### 4.5. Detail route

`app/discoveries/[aotdId].tsx`:

- Fetch `useDiscoveryDetail(aotdId)`.
- Render shared `AlbumDetail`.
- Include a back affordance.
- Preserve Discoveries history access even if Spotify connection is broken.

---

## 5. Spotify Open Flow

### 5.1. Opening album

Use `expo-linking` / React Native `Linking`:

1. Build `spotify:album:{album_spotify_id}`.
2. Check `Linking.canOpenURL`.
3. Open Spotify URI when available.
4. Fallback to `https://open.spotify.com/album/{album_spotify_id}`.

Status mutation:

- If status is `pending`, update to `opened`.
- If status is `opened` or `rated`, do not update.
- If update fails, still open Spotify and show only a soft failure.

### 5.2. Free Spotify explainer

Read `streaming_connections_safe.spotify_product`.

Show once when:

- product is `free` or `open`
- user has not dismissed `aotd:spotify-free-explainer-dismissed:{userId}`
- user taps Open in Spotify or sees the action area for the first time

Do not block opening the album.

---

## 6. Share Flow

### 6.1. Dependencies

Already present in `package.json` with Expo SDK 54-compatible versions:

```bash
PATH=/opt/homebrew/bin:$PATH npx expo install expo-sharing react-native-view-shot -- --legacy-peer-deps
```

Do not use plain `npm install` if these dependencies need to be reinstalled or repaired.

### 6.2. Capture

Use `react-native-view-shot`:

- Render `ShareCard` in the detail screen.
- Keep it either visually hidden but mounted or in a stable offscreen capture area.
- Capture as PNG.
- If cover art fails to load, still share a text-first card with a neutral album-cover placeholder.

### 6.3. Share Sheet

Use `expo-sharing.shareAsync(uri, options)`.

Include:

- PNG card
- Spotify web URL and text where supported

Text:

> My album of the day: {Artist} — {Album} {spotify_url}

No custom target-specific integrations in Phase 5.

---

## 7. Error and Empty States

- No current pick: keep `WaitingForPick`.
- Discoveries has no rows: keep first-discovery empty state.
- Detail row missing/not owned: show "Discovery not found" with back action.
- Rating save failure: alert with friendly copy; keep local form input intact.
- Spotify open failure: alert "Could not open Spotify right now."
- Share unavailable: alert "Sharing is not available on this device."
- Capture failure: alert "Could not build the share card."
- Offline: React Query should continue showing cached data when available; do not add a full offline system in Phase 5.

---

## 8. Implementation Order

1. Write Phase 5 plan file.
2. Install share dependencies with Expo install and `--legacy-peer-deps`.
3. Add Supabase migration:
   - `ratings`
   - read RPCs
   - save rating RPC
   - trigger update for `pending -> rated`
4. Update generated/temporary DB types.
5. Extend shared recommendation/discovery TypeScript types and helpers.
6. Add hooks:
   - `useDiscoveries`
   - `useDiscoveryDetail`
   - `useSaveRating`
   - Spotify/free explainer helpers
7. Build `components/album/*`.
8. Update Home to use shared detail.
9. Replace Discoveries placeholder with status tabs and list.
10. Add detail route.
11. Wire share card capture and Share Sheet.
12. Run verification.

---

## 9. Verification

Automated:

```bash
PATH=/opt/homebrew/bin:$PATH npm run typecheck
PATH=/opt/homebrew/bin:$PATH npm run lint
```

Database/manual:

```bash
PATH=/opt/homebrew/bin:$PATH npm run db:push
PATH=/opt/homebrew/bin:$PATH npm run db:types
```

Manual QA:

- Today's pending album renders on Home.
- Tapping Open in Spotify opens Spotify or web fallback.
- Pending album becomes `opened` after opening.
- Saving `Loved it / Liked it / It was alright / Not for me / Bad` stores `5/4/3/2/1`.
- Rating from `pending` works and sets AOTD to `rated`.
- Editing a rating updates the same row.
- Rating microcopy appears once.
- Free Spotify explainer appears once for `free`/`open`.
- Discoveries `All / Pending / Rated` tabs filter correctly.
- Detail route loads a historical album by `aotdId`.
- Share card renders nonblank and opens native iOS Share Sheet.
- Discoveries history remains accessible if Spotify connection is broken.

---

## 10. Non-Goals

- No search in Discoveries.
- No social feed or friend sharing.
- No public ratings controls.
- No skip/listened status.
- No algorithm changes based on ratings.
- No Android-specific share polish.
- No full production offline/cache layer.
- No i18n.

---

## 11. Handoff Notes

- Regenerate `types/database.ts` from the linked Supabase project after migrations are applied.
- If package install is needed again, use `--legacy-peer-deps`.
- Keep `react` and `react-native` pinned exactly.
- Do not expose `streaming_connections` base table to the client.
- Do not reintroduce deleted Library UI files or tabs.
- Keep `SyncBanner` in Profile only.

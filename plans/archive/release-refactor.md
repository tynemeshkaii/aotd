# Release Refactor Notes

Last updated: 2026-06-02.

## 2026-06-02 Review Result 1 Fixes

Implemented fixes:

- Initial sync failure UI no longer displays raw backend `library_sync_status.error_message`.
  - `components/skins/shared/InitialSyncingController.tsx`
  - `components/skins/editorial/index.tsx`
  - `theme/skins/types.ts`
- Spotify token refresh persistence now checks the `streaming_connections` update result and fails with
  `db_update_failed` when the refreshed token cannot be saved.
  - `supabase/functions/_shared/spotify.ts`
- `upsert-streaming-connection` now returns `400 invalid_json_body` for malformed JSON instead of falling
  through to `500 unexpected`.
  - `supabase/functions/upsert-streaming-connection/index.ts`
- Added a follow-up migration that caps direct RPC calls to `get_discoveries` at 365 rows.
  - `supabase/migrations/20260602120000_cap_get_discoveries_limit.sql`

Local validation:

- `npm install --legacy-peer-deps` completed so local project tooling was available.
- `npm run typecheck` passed.
- `npm run lint` passed.

Supabase remote status:

- `npx supabase db push` applied the release migrations to project `ioypxszjxnjrdnhcpmst`.
- `npx supabase gen types typescript --linked > types/database.ts` regenerated local DB types.
- Edge Functions were deployed to project `ioypxszjxnjrdnhcpmst`.

Notes:

- `Docker is not running` appeared as a Supabase CLI warning during function deploys, but every deploy command completed successfully.
- Deno handler tests were not run in this environment because `deno` is not installed.

## 2026-06-02 Refactor Pass Summary

Branch: `refactor-mskrad`.

Recent commits:

- `c6a7d4f fix release review findings`
- `154b743 refactor ai slop findings`
- `9bed73b optimize profile discovery and sync paths`
- `9e5e847 refactor profile queries and realtime invalidation`
- `9ff280f fix final review regressions`
- `41b818d Fix discovery detail back navigation`

Implemented follow-up fixes:

- Declared direct React Navigation dependencies used by tab layout:
  - `@react-navigation/bottom-tabs`
  - `@react-navigation/elements`
- Removed OAuth debug `console.info` calls from client auth flow.
- Added runtime parsing/shape checks for RPC-facing app data:
  - `AlbumDiscovery`
  - `ProfileOverview`
- Sanitized Edge Function logs that previously included user/music identifiers in compute/prewarm paths.
- Added `supabase/functions/_shared/logger.ts` for Edge Function logging calls.
- Added lightweight Home count RPC/hook so Home does not fetch the Discoveries archive just to show the old-unrated-picks footer.
  - `supabase/migrations/20260602130000_unrated_past_pick_count.sql`
  - `lib/hooks/useUnratedPastPickCount.ts`
- Capped caller-supplied `get_discoveries` limits in a follow-up migration.
  - `supabase/migrations/20260602120000_cap_get_discoveries_limit.sql`
- `useDiscoveries` now sends explicit `p_limit` / `p_offset` and uses a prefix key for invalidation.
- Profile production-note stats now come through `get_profile_overview`, removing the extra `useLibraryStats` request path.
  - `supabase/migrations/20260602131000_profile_overview_library_stats.sql`
- Sync progress writes are throttled instead of updating `library_sync_status` on every Spotify page.
- Profile identity and Spotify connection reads were moved from `ProfileController` into hooks:
  - `lib/hooks/useProfileIdentity.ts`
  - `lib/hooks/useSpotifyConnection.ts`
- Shared user-scoped realtime invalidation was factored into:
  - `lib/hooks/useUserRealtimeInvalidation.ts`
- Fixed final review regressions:
  - Discoveries realtime/mutation invalidation now targets the prefix key and matches paginated list queries.
  - Profile overview invalidates after sync status realtime updates and manual sync settle.
  - `dispatch-daily-picks` no longer logs raw user IDs on compute failures.

Local validation after the refactor passes:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx expo install --check` passed after aligning Expo SDK 54-compatible dependency ranges.
- `npx aislop scan -d --json --exclude 'node_modules,.git,.expo,dist,build,coverage,.env,.env.*,types/database.ts'` was run during the ai-slop pass. Final useful cleanup removed fixable ai-slop findings; remaining categories were mostly Deno global false positives, stable public URLs, complexity warnings, and audit warnings requiring an Expo major/SDK upgrade.
- `npm audit --omit=dev` / audit checks reported moderate `postcss` and `uuid` findings, but npm's fix path requires `expo@56.0.8`; do not run `npm audit fix --force` while the project is intentionally on Expo SDK 54.

Expo Go debug status:

- `npm run start -- --lan` starts Metro successfully when run with network access.
- Last observed Expo Go LAN URL: `exp://192.168.31.64:8081`.
- Metro was stopped cleanly after the debug attempt.

Useful debug commands:

```bash
cd /Users/timurkurmangaliev/aotd
npm run typecheck
npm run lint
npm run start -- --lan
```

If the phone cannot reach the LAN URL:

```bash
npm run start -- --tunnel
```

If Metro cache looks stale:

```bash
npx expo start -c --lan
```

Remote release status:

- `npx supabase db push` applied:
  - `20260602120000_cap_get_discoveries_limit.sql`
  - `20260602130000_unrated_past_pick_count.sql`
  - `20260602131000_profile_overview_library_stats.sql`
  - `20260602142000_album_issue_number.sql`
- `npx supabase gen types typescript --linked > types/database.ts` completed and `npm run typecheck` passed afterward.
- Local Expo public env was added in ignored `.env.local`:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`
  - `EXPO_PUBLIC_ENV`
- Supabase Edge Function secrets were set for Spotify, Last.fm, and cron auth. Secret values are intentionally not stored in this doc.
- Spotify OAuth scopes include `user-read-email` again for Supabase profile resolution. Spotify accounts with unverified email addresses can return `Unverified email with spotify`.
- Album issue labels now use the per-user pick ordinal returned by RPCs (`issue_number`) instead of a calendar day-of-year calculation.
- Deployed Edge Functions on project `ioypxszjxnjrdnhcpmst`:
  - `upsert-streaming-connection`
  - `sync-spotify-library`
  - `refresh-spotify-token`
  - `compute-album-of-the-day`
  - `prewarm-album-cache`
  - `prewarm-user-candidates`
  - `dispatch-daily-picks`

Manual smoke checklist before merge/release:

- Home: loading, error, waiting, success, old unrated footer.
- Discoveries: All / Waiting / Rated filters update after open/rating without manual refresh.
- Discovery detail: back navigation returns to Discoveries and preserves normal back behavior.
- Profile: loading states, connected Spotify state, production-note stats after sync.
- Rating: save success, first-time microcopy, Today/Discoveries/detail invalidation.
- Sync: queued/syncing/completed/failed UI, progress still feels live after throttling.

Known non-blocking follow-ups:

- Split `components/skins/editorial/index.tsx` into smaller files after visual smoke coverage.
- Move rating mutation orchestration out of the editorial skin boundary.
- Consider isolating auth bootstrap side effects after adding coverage for one-shot auto-sync/timezone behavior.
- Add app/client tests for parser functions and query invalidation behavior.

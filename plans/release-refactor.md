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

Supabase remote follow-up status:

- `npx supabase db push` did not run because the local checkout is not linked:
  `Cannot find project ref. Have you run supabase link?`
- `npx supabase functions deploy upsert-streaming-connection` did not run because this environment has no
  Supabase access token:
  `Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.`

Required remote steps after Supabase auth/link:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
npm run db:types
npx supabase functions deploy upsert-streaming-connection
npx supabase functions deploy sync-spotify-library
npx supabase functions deploy compute-album-of-the-day
npx supabase functions deploy prewarm-user-candidates
```

Notes:

- `npm run db:types` should run after `npm run db:push` so `types/database.ts` reflects the live linked DB.
- The functions listed for deploy either changed directly or import the changed `getValidSpotifyToken` helper.
- Deno handler tests were not run in this environment because `deno` is not installed.

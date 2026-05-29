import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { aggregateLibrary } from '../_shared/library-aggregation.ts';
import {
  fetchAllSpotifyPaged,
  getValidSpotifyToken,
  type SpotifySavedAlbum,
  type SpotifySavedTrack,
} from '../_shared/spotify.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

type SyncStartResult = {
  should_start: boolean;
  status: 'idle' | 'queued' | 'syncing' | 'completed' | 'failed';
  started_at: string | null;
  updated_at: string | null;
  aggregated_albums_count: number | null;
};

const SPOTIFY_PAGE_SIZE = 50;
const SYNC_LOG_EVERY_PAGES = 10;
const DEFAULT_BOUNDED_SYNC_PAGES = 3;

type SyncMode = 'initial' | 'bounded' | 'full_reconcile';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonError(500, 'missing_env');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'missing_auth');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return jsonError(401, 'invalid_user');

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payload = await parsePayload(req).catch((error) => {
      if (error instanceof Error && error.message === 'invalid_sync_mode') {
        throw new Response(JSON.stringify({ error: 'invalid_sync_mode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw error;
    });
    const mode = payload.mode ?? 'initial';
    const startedAt = new Date().toISOString();
    const start = await tryStartLibrarySync(admin, user.id, startedAt);

    if (!start.should_start) {
      return jsonResponse(
        {
          ok: true,
          status: start.status,
          already_running: start.status === 'queued' || start.status === 'syncing',
          updated_at: start.updated_at,
        },
        { status: 202 },
      );
    }

    // Background — client gets 202 immediately and listens via Realtime.
    EdgeRuntime.waitUntil(runSync(admin, user.id, start.started_at ?? startedAt, mode));

    return jsonResponse({ ok: true, status: 'queued', mode }, { status: 202 });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonError(500, 'unexpected', String(e));
  }
});

async function runSync(admin: SupabaseClient, userId: string, startedAt: string, mode: SyncMode) {
  try {
    await patchSyncStatus(admin, userId, { status: 'syncing', processed_count: 0 }, startedAt);

    const token = await getValidSpotifyToken(admin, userId);
    const trackLimit = getSyncTrackLimit();
    const boundedMaxPages = mode === 'bounded' ? getBoundedSyncPages() : undefined;
    const maxAlbumPages = boundedMaxPages;
    const maxTrackPages =
      boundedMaxPages ?? (trackLimit ? Math.ceil(trackLimit / SPOTIFY_PAGE_SIZE) : undefined);

    const savedAlbums: SpotifySavedAlbum[] = [];
    const savedTracks: SpotifySavedTrack[] = [];

    await fetchAllSpotifyPaged<SpotifySavedAlbum>(
      '/me/albums',
      token,
      async (page) => {
        savedAlbums.push(...page.items);
        await patchSyncStatus(
          admin,
          userId,
          {
            total_estimate: page.total,
            processed_count: savedAlbums.length,
            saved_albums_count: savedAlbums.length,
          },
          startedAt,
        );
      },
      () => getValidSpotifyToken(admin, userId),
      {
        admin,
        userId,
        endpointName: 'paged_library_albums',
        label: 'saved albums',
        logEveryPages: SYNC_LOG_EVERY_PAGES,
        maxPages: maxAlbumPages,
        rateLimitIntervalMs: mode === 'bounded' ? 500 : undefined,
      },
    );

    await fetchAllSpotifyPaged<SpotifySavedTrack>(
      '/me/tracks',
      token,
      async (page) => {
        const remainingTracks = trackLimit
          ? Math.max(trackLimit - savedTracks.length, 0)
          : page.items.length;
        savedTracks.push(...page.items.slice(0, remainingTracks));
        const estimatedTracks = trackLimit ? Math.min(page.total, trackLimit) : page.total;
        await patchSyncStatus(
          admin,
          userId,
          {
            total_estimate: savedAlbums.length + estimatedTracks,
            processed_count: savedAlbums.length + savedTracks.length,
            saved_tracks_count: savedTracks.length,
          },
          startedAt,
        );
      },
      () => getValidSpotifyToken(admin, userId),
      {
        admin,
        userId,
        endpointName: 'paged_library_tracks',
        label: 'saved tracks',
        logEveryPages: SYNC_LOG_EVERY_PAGES,
        maxPages: maxTrackPages,
        rateLimitIntervalMs: mode === 'bounded' ? 500 : undefined,
      },
    );

    const aggregated = aggregateLibrary(savedAlbums, savedTracks);
    await patchSyncStatus(
      admin,
      userId,
      {
        processed_count: savedAlbums.length + savedTracks.length,
      },
      startedAt,
    );

    // Stamp synced_at with startedAt so post-sync reconciliation can identify
    // rows that did NOT appear in this sync (synced_at < startedAt → removed).
    const rows = aggregated.map((a) => ({
      user_id: userId,
      provider: 'spotify' as const,
      provider_album_id: a.provider_album_id,
      album_name: a.album_name,
      artist_name: a.artist_name,
      primary_artist_spotify_id: a.artist_ids[0]?.id ?? null,
      artist_ids: a.artist_ids.length > 0 ? a.artist_ids : null,
      cover_url: a.cover_url,
      total_tracks: a.total_tracks,
      release_year: a.release_year,
      added_at_provider: a.added_at_provider,
      source: a.source,
      synced_at: startedAt,
      removed_at: null,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin
        .from('user_library')
        .upsert(chunk, { onConflict: 'user_id,provider,provider_album_id' });
      if (error) throw new Error(`db_upsert_failed:${error.message}`);
    }

    const reconcileAt = new Date().toISOString();
    if (mode === 'bounded') {
      console.warn('[sync-spotify-library] bounded sync; skipping reconciliation');
      await stampConnectionSyncedAt(admin, userId, reconcileAt);
    } else if (trackLimit) {
      console.warn(
        '[sync-spotify-library] SYNC_TRACK_LIMIT is set; skipping reconciliation and last_synced_at update',
      );
    } else {
      // Soft-delete: anything we didn't touch this sync is no longer in Spotify.
      // Safe for huge libraries — no `not in (...)` payload.
      const { error: reconcileErr } = await admin
        .from('user_library')
        .update({ removed_at: reconcileAt })
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .is('removed_at', null)
        .lt('synced_at', startedAt);
      if (reconcileErr) throw new Error(`db_reconcile_failed:${reconcileErr.message}`);

      await stampConnectionSyncedAt(admin, userId, reconcileAt);
    }

    const aggregatedAlbumsCount =
      mode === 'bounded' ? await countActiveLibraryAlbums(admin, userId) : aggregated.length;

    await patchSyncStatus(
      admin,
      userId,
      {
        status: 'completed',
        completed_at: reconcileAt,
        aggregated_albums_count: aggregatedAlbumsCount,
      },
      startedAt,
    );

    // Day-1 prewarm + compute trigger — fire-and-forget.
    try {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      if (mode !== 'bounded' && cronSecret && supabaseUrl) {
        EdgeRuntime.waitUntil(
          (async () => {
            try {
              await fetch(`${supabaseUrl}/functions/v1/prewarm-user-candidates`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${cronSecret}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId }),
              });
              await fetch(`${supabaseUrl}/functions/v1/compute-album-of-the-day`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${cronSecret}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId }),
              });
            } catch (e) {
              console.warn(
                '[day-1-prewarm-compute] trigger failed',
                e instanceof Error ? e.message : e,
              );
            }
          })(),
        );
      }
    } catch {
      // Non-blocking: failure here doesn't break sync completion.
    }
  } catch (e) {
    try {
      await patchSyncStatus(
        admin,
        userId,
        {
          status: 'failed',
          error_code: 'sync_failed',
          error_message: e instanceof Error ? e.message : String(e),
          completed_at: new Date().toISOString(),
        },
        startedAt,
      );
    } catch (statusError) {
      console.warn(
        '[sync-spotify-library] failed to persist failed status',
        statusError instanceof Error ? statusError.message : String(statusError),
      );
    }
  }
}

async function parsePayload(req: Request): Promise<{ mode?: SyncMode }> {
  try {
    const payload = (await req.json()) as { mode?: unknown };
    if (
      payload.mode === undefined ||
      payload.mode === 'initial' ||
      payload.mode === 'bounded' ||
      payload.mode === 'full_reconcile'
    ) {
      return payload as { mode?: SyncMode };
    }
    throw new Error('invalid_sync_mode');
  } catch (e) {
    if (e instanceof SyntaxError) return {};
    throw e;
  }
}

async function tryStartLibrarySync(
  admin: SupabaseClient,
  userId: string,
  startedAt: string,
): Promise<SyncStartResult> {
  const { data, error } = await admin.rpc('try_start_library_sync', {
    p_user_id: userId,
    p_started_at: startedAt,
  });

  if (error) {
    throw new Error(`sync_start_failed:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as SyncStartResult | null;
  if (!row) {
    throw new Error('sync_start_failed:empty_result');
  }

  return row;
}

/**
 * Partial update of the existing sync-status row. Use this for incremental
 * progress writes — UPSERT validates NOT NULL at INSERT time before resolving
 * ON CONFLICT, so patches without `status` would otherwise fail.
 */
async function patchSyncStatus(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
  startedAt?: string,
) {
  let query = admin.from('library_sync_status').update(patch).eq('user_id', userId);
  if (startedAt) {
    query = query.eq('started_at', startedAt);
  }

  const { data, error } = await query.select('user_id');
  if (error) {
    throw new Error(`sync_status_update_failed:${error.message}`);
  }
  if (startedAt && (!data || data.length === 0)) {
    throw new Error('sync_status_update_skipped:stale_run');
  }
}

async function stampConnectionSyncedAt(admin: SupabaseClient, userId: string, syncedAt: string) {
  const { error } = await admin
    .from('streaming_connections')
    .update({ last_synced_at: syncedAt })
    .eq('user_id', userId)
    .eq('provider', 'spotify');
  if (error) throw new Error(`connection_sync_stamp_failed:${error.message}`);
}

function getSyncTrackLimit() {
  const raw = Deno.env.get('SYNC_TRACK_LIMIT');
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[sync-spotify-library] ignoring invalid SYNC_TRACK_LIMIT=${raw}`);
    return null;
  }

  return Math.floor(value);
}

function getBoundedSyncPages() {
  const raw = Deno.env.get('BOUNDED_SYNC_PAGES');
  if (!raw) return DEFAULT_BOUNDED_SYNC_PAGES;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BOUNDED_SYNC_PAGES;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

async function countActiveLibraryAlbums(admin: SupabaseClient, userId: string) {
  const { count, error } = await admin
    .from('user_library')
    .select('provider_album_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .is('removed_at', null);
  if (error) throw new Error(`library_count_failed:${error.message}`);
  return count ?? 0;
}

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

    const startedAt = new Date().toISOString();

    await upsertSyncStatus(admin, user.id, {
      status: 'queued',
      started_at: startedAt,
      completed_at: null,
      total_estimate: null,
      processed_count: 0,
      saved_albums_count: null,
      saved_tracks_count: null,
      aggregated_albums_count: null,
      error_code: null,
      error_message: null,
    });

    // Background — client gets 202 immediately and listens via Realtime.
    EdgeRuntime.waitUntil(runSync(admin, user.id, startedAt));

    return jsonResponse({ ok: true, status: 'queued' }, { status: 202 });
  } catch (e) {
    return jsonError(500, 'unexpected', String(e));
  }
});

async function runSync(admin: SupabaseClient, userId: string, startedAt: string) {
  try {
    await patchSyncStatus(admin, userId, { status: 'syncing', processed_count: 0 });

    const token = await getValidSpotifyToken(admin, userId);

    const savedAlbums: SpotifySavedAlbum[] = [];
    const savedTracks: SpotifySavedTrack[] = [];

    await fetchAllSpotifyPaged<SpotifySavedAlbum>(
      '/me/albums',
      token,
      async (page) => {
        savedAlbums.push(...page.items);
        await patchSyncStatus(admin, userId, {
          total_estimate: page.total,
          processed_count: savedAlbums.length,
          saved_albums_count: savedAlbums.length,
        });
      },
      () => getValidSpotifyToken(admin, userId),
    );

    await fetchAllSpotifyPaged<SpotifySavedTrack>(
      '/me/tracks',
      token,
      async (page) => {
        savedTracks.push(...page.items);
        await patchSyncStatus(admin, userId, {
          total_estimate: savedAlbums.length + page.total,
          processed_count: savedAlbums.length + savedTracks.length,
          saved_tracks_count: savedTracks.length,
        });
      },
      () => getValidSpotifyToken(admin, userId),
    );

    const aggregated = aggregateLibrary(savedAlbums, savedTracks);

    // Stamp synced_at with startedAt so post-sync reconciliation can identify
    // rows that did NOT appear in this sync (synced_at < startedAt → removed).
    const rows = aggregated.map((a) => ({
      user_id: userId,
      provider: 'spotify' as const,
      provider_album_id: a.provider_album_id,
      album_name: a.album_name,
      artist_name: a.artist_name,
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

    // Soft-delete: anything we didn't touch this sync is no longer in Spotify.
    // Safe for huge libraries — no `not in (...)` payload.
    const reconcileAt = new Date().toISOString();
    const { error: reconcileErr } = await admin
      .from('user_library')
      .update({ removed_at: reconcileAt })
      .eq('user_id', userId)
      .eq('provider', 'spotify')
      .is('removed_at', null)
      .lt('synced_at', startedAt);
    if (reconcileErr) throw new Error(`db_reconcile_failed:${reconcileErr.message}`);

    await admin
      .from('streaming_connections')
      .update({ last_synced_at: reconcileAt })
      .eq('user_id', userId)
      .eq('provider', 'spotify');

    await patchSyncStatus(admin, userId, {
      status: 'completed',
      completed_at: reconcileAt,
      aggregated_albums_count: aggregated.length,
    });
  } catch (e) {
    await patchSyncStatus(admin, userId, {
      status: 'failed',
      error_code: 'sync_failed',
      error_message: e instanceof Error ? e.message : String(e),
      completed_at: new Date().toISOString(),
    });
  }
}

async function upsertSyncStatus(
  admin: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await admin
    .from('library_sync_status')
    .upsert({ user_id: userId, provider: 'spotify', ...patch }, { onConflict: 'user_id' });
  if (error && error.code !== '23505') {
    console.warn('[sync-spotify-library] upsertSyncStatus failed', error.message);
  }
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
) {
  const { error } = await admin.from('library_sync_status').update(patch).eq('user_id', userId);
  if (error) {
    console.warn('[sync-spotify-library] patchSyncStatus failed', error.message);
  }
}

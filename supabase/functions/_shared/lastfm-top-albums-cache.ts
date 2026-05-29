import type { SupabaseClient } from '@supabase/supabase-js';
import { recordExternalApiCall } from './external-api-log.ts';
import { reserveExternalApiSlot } from './external-api-rate-limit.ts';
import { fetchTopAlbumsForArtist, type LastfmTopAlbum } from './lastfm.ts';

const TOP_ALBUMS_TTL_DAYS = 30;
const CACHE_LIMIT = 10;

type LastfmTopAlbumsCacheRow = {
  normalized_artist: string;
  artist_name: string;
  top_albums: LastfmTopAlbum[];
  fetched_at: string;
};

export async function getLastfmTopAlbumsCached(
  admin: SupabaseClient,
  artistName: string,
  limit = 5,
): Promise<LastfmTopAlbum[]> {
  const normalizedArtist = normalizeArtistName(artistName);
  const { data: cached } = await admin
    .from('lastfm_artist_top_albums_cache')
    .select('normalized_artist, artist_name, top_albums, fetched_at')
    .eq('normalized_artist', normalizedArtist)
    .maybeSingle();

  const row = cached as LastfmTopAlbumsCacheRow | null;
  if (row && !isStale(row.fetched_at, TOP_ALBUMS_TTL_DAYS)) {
    return row.top_albums.slice(0, limit);
  }

  const startedAt = Date.now();
  try {
    await reserveExternalApiSlot(admin, 'lastfm', 'artist_get_top_albums', 350);
    const fresh = await fetchTopAlbumsForArtist(artistName, Math.max(limit, CACHE_LIMIT));
    await recordExternalApiCall(admin, {
      service: 'lastfm',
      endpoint: 'artist_get_top_albums',
      status: 200,
      ok: true,
      duration_ms: Date.now() - startedAt,
    });
    await admin.from('lastfm_artist_top_albums_cache').upsert(
      {
        normalized_artist: normalizedArtist,
        artist_name: artistName,
        top_albums: fresh,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'normalized_artist' },
    );
    return fresh.slice(0, limit);
  } catch (e) {
    await recordExternalApiCall(admin, {
      service: 'lastfm',
      endpoint: 'artist_get_top_albums',
      ok: false,
      duration_ms: Date.now() - startedAt,
      error_code: e instanceof Error ? e.message : String(e),
    });
    if (row) {
      console.warn(
        `[lastfm-top-albums-cache] using_stale artist="${artistName}" error=${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return row.top_albums.slice(0, limit);
    }
    throw e;
  }
}

function normalizeArtistName(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}

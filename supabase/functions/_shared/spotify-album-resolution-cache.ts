import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertExternalApiCircuitAllows,
  ExternalApiCircuitOpenError,
  recordExternalApiCircuitFailure,
  recordExternalApiCircuitSuccess,
} from './external-api-breaker.ts';
import { recordExternalApiCall } from './external-api-log.ts';
import { reserveExternalApiSlot } from './external-api-rate-limit.ts';
import {
  isStrongAlbumSearchMatch,
  type SpotifyAlbumSearchItem,
  SpotifyApiError,
  searchAlbum,
} from './spotify-extended.ts';

const RESOLVED_TTL_DAYS = 90;
const NO_MATCH_TTL_DAYS = 30;
const BAD_MATCH_TTL_DAYS = 90;
const UNAVAILABLE_TTL_DAYS = 1;
const SPOTIFY_SEARCH_INTERVAL_MS = 1_250;
const DEV_MODE_429_MIN_COOLDOWN_SECONDS = 15 * 60;
const TRANSIENT_UNAVAILABLE_COOLDOWN_SECONDS = 15 * 60;

type ResolutionStatus =
  | 'resolved'
  | 'no_match'
  | 'bad_match'
  | 'rate_limited'
  | 'spotify_unavailable';

type ResolutionCacheRow = {
  normalized_artist: string;
  normalized_album: string;
  requested_artist: string;
  requested_album: string;
  spotify_album_id: string | null;
  status: ResolutionStatus;
  result: (SpotifyAlbumSearchItem & { rejected_as?: string }) | null;
  failure_status: number | null;
  failure_detail: string | null;
  fetched_at: string;
  next_retry_at: string | null;
};

export async function resolveSpotifyAlbumCached(
  admin: SupabaseClient,
  token: string,
  artist: string,
  album: string,
  opts: { market?: string; userId?: string; requestContext?: string; force?: boolean } = {},
): Promise<SpotifyAlbumSearchItem | null> {
  const normalizedArtist = normalizeResolutionKey(artist);
  const normalizedAlbum = normalizeResolutionKey(album);
  const now = Date.now();

  if (!opts.force) {
    const cached = await loadCacheRow(admin, normalizedArtist, normalizedAlbum);
    const cachedResult = cacheResult(cached, now);
    if (cachedResult.kind === 'hit') return cachedResult.album;
    if (cachedResult.kind === 'circuit_open') {
      throw new ExternalApiCircuitOpenError(
        'spotify_search_circuit_open',
        cached?.next_retry_at ?? null,
      );
    }
  }

  await assertExternalApiCircuitAllows(admin, 'spotify', 'search_album');
  await reserveExternalApiSlot(admin, 'spotify', 'search_album', SPOTIFY_SEARCH_INTERVAL_MS);

  const startedAt = Date.now();
  let sp: SpotifyAlbumSearchItem | null;
  try {
    sp = await searchAlbum(token, artist, album, opts.market ?? 'US');
  } catch (e) {
    await handleSpotifySearchFailure(admin, e, {
      normalizedArtist,
      normalizedAlbum,
      requestedArtist: artist,
      requestedAlbum: album,
      durationMs: Date.now() - startedAt,
      requestContext: opts.requestContext ?? null,
      userId: opts.userId ?? null,
    });
    throw e;
  }

  await recordExternalApiCall(admin, {
    service: 'spotify',
    endpoint: 'search_album',
    status: 200,
    ok: true,
    duration_ms: Date.now() - startedAt,
    request_context: opts.requestContext ?? null,
    user_id: opts.userId ?? null,
  });
  await recordExternalApiCircuitSuccess(admin, 'spotify', 'search_album');

  const status: ResolutionStatus = sp
    ? isStrongAlbumSearchMatch(sp, artist, album)
      ? 'resolved'
      : 'bad_match'
    : 'no_match';
  await upsertCacheRow(admin, {
    normalized_artist: normalizedArtist,
    normalized_album: normalizedAlbum,
    requested_artist: artist,
    requested_album: album,
    spotify_album_id: status === 'resolved' ? (sp?.id ?? null) : null,
    status,
    result: status === 'resolved' ? sp : sp ? { ...sp, rejected_as: 'bad_match' } : null,
    failure_status: null,
    failure_detail: status === 'bad_match' ? 'weak_spotify_search_match' : null,
    fetched_at: new Date().toISOString(),
    next_retry_at: null,
  });
  if (status === 'bad_match') {
    console.log(
      `[spotify-resolution] bad_match requested="${artist} - ${album}" spotify="${sp?.artists[0]?.name ?? '?'} - ${sp?.name ?? '?'}"`,
    );
    return null;
  }
  return sp;
}

async function loadCacheRow(
  admin: SupabaseClient,
  normalizedArtist: string,
  normalizedAlbum: string,
) {
  const { data, error } = await admin
    .from('spotify_album_resolution_cache')
    .select(
      'normalized_artist, normalized_album, requested_artist, requested_album, spotify_album_id, status, result, failure_status, failure_detail, fetched_at, next_retry_at',
    )
    .eq('normalized_artist', normalizedArtist)
    .eq('normalized_album', normalizedAlbum)
    .maybeSingle();
  if (error) throw new Error(`spotify_resolution_cache_load_failed:${error.message}`);
  return data as ResolutionCacheRow | null;
}

function cacheResult(
  row: ResolutionCacheRow | null,
  now: number,
):
  | { kind: 'miss' }
  | { kind: 'hit'; album: SpotifyAlbumSearchItem | null }
  | { kind: 'circuit_open' } {
  if (!row) return { kind: 'miss' };
  if (row.status === 'resolved' && row.result && !isStale(row.fetched_at, RESOLVED_TTL_DAYS, now)) {
    return { kind: 'hit', album: row.result };
  }
  if (row.status === 'no_match' && !isStale(row.fetched_at, NO_MATCH_TTL_DAYS, now)) {
    return { kind: 'hit', album: null };
  }
  if (row.status === 'bad_match' && !isStale(row.fetched_at, BAD_MATCH_TTL_DAYS, now)) {
    return { kind: 'hit', album: null };
  }
  if (
    (row.status === 'rate_limited' || row.status === 'spotify_unavailable') &&
    row.next_retry_at &&
    new Date(row.next_retry_at).getTime() > now
  ) {
    if (row.status === 'rate_limited') return { kind: 'circuit_open' };
    return { kind: 'hit', album: null };
  }
  return { kind: 'miss' };
}

async function upsertCacheRow(admin: SupabaseClient, row: ResolutionCacheRow) {
  const { error } = await admin.from('spotify_album_resolution_cache').upsert(row, {
    onConflict: 'normalized_artist,normalized_album',
  });
  if (error) throw new Error(`spotify_resolution_cache_write_failed:${error.message}`);
}

async function handleSpotifySearchFailure(
  admin: SupabaseClient,
  e: unknown,
  opts: {
    normalizedArtist: string;
    normalizedAlbum: string;
    requestedArtist: string;
    requestedAlbum: string;
    durationMs: number;
    requestContext: string | null;
    userId: string | null;
  },
) {
  const status = e instanceof SpotifyApiError ? e.status : null;
  const retryAfterSeconds = e instanceof SpotifyApiError ? e.retryAfterSeconds : null;
  const isRateLimited = status === 429;
  const isServerUnavailable = status !== null && status >= 500;
  const isForbidden = status === 403;
  const isTransientNetworkFailure = status === null;
  const shouldFailClosed =
    isRateLimited || isForbidden || isServerUnavailable || isTransientNetworkFailure;
  const failureDetail = e instanceof Error ? e.message : String(e);
  const retrySeconds = isRateLimited
    ? Math.max(retryAfterSeconds ?? 0, DEV_MODE_429_MIN_COOLDOWN_SECONDS)
    : isForbidden
      ? UNAVAILABLE_TTL_DAYS * 24 * 60 * 60
      : TRANSIENT_UNAVAILABLE_COOLDOWN_SECONDS;
  const nextRetryAt = new Date(Date.now() + retrySeconds * 1000).toISOString();

  await recordExternalApiCall(admin, {
    service: 'spotify',
    endpoint: 'search_album',
    status,
    ok: false,
    duration_ms: opts.durationMs,
    retry_after_seconds: retryAfterSeconds ?? null,
    error_code: failureDetail,
    request_context: opts.requestContext,
    user_id: opts.userId,
  });

  if (!shouldFailClosed) return;

  await recordExternalApiCircuitFailure(admin, 'spotify', 'search_album', {
    status,
    error: failureDetail,
    cooldownSeconds: retrySeconds,
  });
  await upsertCacheRow(admin, {
    normalized_artist: opts.normalizedArtist,
    normalized_album: opts.normalizedAlbum,
    requested_artist: opts.requestedArtist,
    requested_album: opts.requestedAlbum,
    spotify_album_id: null,
    status: isRateLimited ? 'rate_limited' : 'spotify_unavailable',
    result: null,
    failure_status: status,
    failure_detail: failureDetail.slice(0, 500),
    fetched_at: new Date().toISOString(),
    next_retry_at: nextRetryAt,
  });
}

function normalizeResolutionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\b(remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isStale(fetchedAt: string, ttlDays: number, now = Date.now()) {
  return now - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordExternalApiCall, safeRetryAfterSeconds } from './external-api-log.ts';
import { reserveExternalApiSlot } from './external-api-rate-limit.ts';

type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  images?: SpotifyImage[];
  product?: 'premium' | 'free' | 'open';
};

export type SpotifyRefreshResult = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type SpotifyAlbumLite = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: SpotifyImage[];
  release_date: string;
  total_tracks: number;
};

export type SpotifySavedAlbum = {
  added_at: string;
  album: SpotifyAlbumLite;
};

export type SpotifySavedTrack = {
  added_at: string;
  track: { album: SpotifyAlbumLite };
};

export type SpotifyPaged<T> = {
  items: T[];
  next: string | null;
  total: number;
};

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_PAGE_LIMIT = 50;
const SPOTIFY_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_429_RETRIES = 5;
const MAX_429_BACKOFF_MS = 60_000;

type FetchAllSpotifyPagedOptions = {
  maxPages?: number;
  max429Retries?: number;
  logEveryPages?: number;
  label?: string;
  admin?: SupabaseClient;
  userId?: string;
  endpointName?: string;
  rateLimitIntervalMs?: number;
};

export async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetchWithTimeout(
    'https://api.spotify.com/v1/me',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    SPOTIFY_FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`spotify_me_failed:${response.status}`);
  }

  return (await response.json()) as SpotifyProfile;
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('missing_spotify_credentials');
  }

  const response = await fetchWithTimeout(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    },
    SPOTIFY_FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`spotify_refresh_failed:${response.status}`);
  }

  return (await response.json()) as SpotifyRefreshResult;
}

/**
 * Return a valid access_token for the user. If the stored token expires within
 * 60s, refresh it and persist the new access_token (and refresh_token, if
 * Spotify rotated it) before returning.
 */
export async function getValidSpotifyToken(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from('streaming_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single();

  if (error || !data) throw new Error('connection_not_found');

  const expiresAt = new Date(data.token_expires_at).getTime();
  const isExpiringSoon = expiresAt - Date.now() < 60_000;
  if (!isExpiringSoon) return data.access_token;

  const refreshed = await refreshSpotifyAccessToken(data.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await admin
    .from('streaming_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt,
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('user_id', userId)
    .eq('provider', 'spotify');

  return refreshed.access_token;
}

/**
 * Paginate a Spotify endpoint (limit=50), invoking `onPage` for each page.
 * Handles 429 (Retry-After) and rotates the bearer once on 401 via `refreshToken`.
 */
export async function fetchAllSpotifyPaged<T>(
  endpoint: string,
  initialToken: string,
  onPage: (page: SpotifyPaged<T>) => Promise<void> | void,
  refreshToken: () => Promise<string>,
  options: FetchAllSpotifyPagedOptions = {},
): Promise<{ totalFetched: number }> {
  let token = initialToken;
  let url: string | null = `${SPOTIFY_API}${endpoint}?limit=${SPOTIFY_PAGE_LIMIT}`;
  let totalFetched = 0;
  let retriedAuth = false;
  let rateLimitRetries = 0;
  let pagesFetched = 0;

  const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
  const max429Retries = options.max429Retries ?? DEFAULT_MAX_429_RETRIES;

  while (url) {
    if (pagesFetched >= maxPages) {
      console.log(
        `[spotify] stopped ${options.label ?? endpoint} after ${pagesFetched} pages (${totalFetched} items)`,
      );
      break;
    }

    if (options.admin && options.rateLimitIntervalMs) {
      await reserveExternalApiSlot(
        options.admin,
        'spotify',
        options.endpointName ?? 'paged_library',
        options.rateLimitIntervalMs,
      );
    }

    const requestStartedAt = Date.now();
    const res = await fetchWithTimeout(
      url,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      SPOTIFY_FETCH_TIMEOUT_MS,
    );
    await recordExternalApiCall(options.admin, {
      service: 'spotify',
      endpoint: options.endpointName ?? 'paged_library',
      status: res.status,
      ok: res.ok,
      duration_ms: Date.now() - requestStartedAt,
      retry_after_seconds: safeRetryAfterSeconds(res),
      error_code: res.ok ? null : `spotify_paged_failed:${res.status}`,
      request_context: options.label ?? endpoint,
      user_id: options.userId ?? null,
    });

    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      token = await refreshToken();
      continue;
    }
    if (res.status === 429) {
      rateLimitRetries += 1;
      if (rateLimitRetries > max429Retries) {
        throw new Error(`spotify_rate_limited:${endpoint}`);
      }

      const retryAfterSeconds = Number(res.headers.get('Retry-After') ?? '0');
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
      const exponentialMs = Math.min(2 ** rateLimitRetries * 1000, MAX_429_BACKOFF_MS);
      const jitterMs = Math.floor(Math.random() * 750);
      const delayMs = Math.min(
        Math.max(retryAfterMs, exponentialMs) + jitterMs,
        MAX_429_BACKOFF_MS,
      );

      console.warn(
        `[spotify] 429 for ${options.label ?? endpoint}; retry ${rateLimitRetries}/${max429Retries} in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok) {
      throw new Error(`spotify_paged_failed:${res.status}`);
    }

    const page = (await res.json()) as SpotifyPaged<T>;
    await onPage(page);
    totalFetched += page.items.length;
    pagesFetched += 1;
    rateLimitRetries = 0;
    url = page.next;
    retriedAuth = false;

    if (options.logEveryPages && pagesFetched % options.logEveryPages === 0) {
      console.log(
        `[spotify] fetched ${totalFetched}/${page.total} ${options.label ?? endpoint} items (${pagesFetched} pages)`,
      );
    }
  }

  return { totalFetched };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

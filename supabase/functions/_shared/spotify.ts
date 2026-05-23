import type { SupabaseClient } from '@supabase/supabase-js';

type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  images?: SpotifyImage[];
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

export async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

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

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

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
): Promise<{ totalFetched: number }> {
  let token = initialToken;
  let url: string | null = `${SPOTIFY_API}${endpoint}?limit=50`;
  let totalFetched = 0;
  let retriedAuth = false;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      token = await refreshToken();
      continue;
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
      await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`spotify_paged_failed:${res.status}`);
    }

    const page = (await res.json()) as SpotifyPaged<T>;
    await onPage(page);
    totalFetched += page.items.length;
    url = page.next;
    retriedAuth = false;
  }

  return { totalFetched };
}

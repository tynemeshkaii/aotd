const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_FETCH_TIMEOUT_MS = 3_500;
const SPOTIFY_429_MAX_RETRIES = 1;
const SPOTIFY_429_MAX_RETRY_AFTER_MS = 1_000;

export type SpotifyAlbumSearchItem = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; height?: number; width?: number }[];
  release_date: string;
  total_tracks: number;
  album_type: string;
};

export type SpotifyAlbumDetails = SpotifyAlbumSearchItem & {
  duration_ms: number;
};

export type SpotifyAudioFeatures = {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  tempo: number;
};

export type SpotifyRelatedArtist = { id: string; name: string };

async function spotifyFetch(url: string, token: string, retryCount = 0): Promise<Response> {
  const res = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    SPOTIFY_FETCH_TIMEOUT_MS,
  );
  // Spotify Development Mode apps return 429 with Retry-After up to several seconds
  // (or much longer when quota is exhausted). Honour at most one retry, and cap the
  // wait — anything longer should be treated as "service unavailable" by the caller
  // so we can fall back rather than blocking the whole compute budget on one call.
  if (res.status === 429 && retryCount < SPOTIFY_429_MAX_RETRIES) {
    const requested = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    const waitMs = Math.min(
      Number.isFinite(requested) && requested > 0 ? requested : 1_000,
      SPOTIFY_429_MAX_RETRY_AFTER_MS,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    return spotifyFetch(url, token, retryCount + 1);
  }
  return res;
}

export async function searchAlbum(
  token: string,
  artist: string,
  album: string,
  market = 'US',
): Promise<SpotifyAlbumSearchItem | null> {
  const q = `album:"${album}" artist:"${artist}"`;
  const url = `${SPOTIFY_API}/search?type=album&limit=5&market=${market}&q=${encodeURIComponent(q)}`;
  const res = await spotifyFetch(url, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { albums?: { items?: SpotifyAlbumSearchItem[] } };
  const items = data.albums?.items ?? [];
  const normalizedAlbum = normalizeSearch(album);
  const normalizedArtist = normalizeSearch(artist);
  const strong = items
    .filter(
      (i) =>
        normalizeSearch(i.name).includes(normalizedAlbum) ||
        normalizedAlbum.includes(normalizeSearch(i.name)),
    )
    .filter((i) => i.artists.some((a) => normalizeSearch(a.name) === normalizedArtist));
  const pool = strong.length > 0 ? strong : items;
  return pool.find((i) => i.album_type === 'album') ?? pool[0] ?? null;
}

export async function fetchAlbumDetails(
  token: string,
  albumId: string,
  market = 'US',
): Promise<SpotifyAlbumDetails | null> {
  const res = await spotifyFetch(`${SPOTIFY_API}/albums/${albumId}?market=${market}`, token);
  if (!res.ok) return null;
  const data = (await res.json()) as SpotifyAlbumSearchItem & {
    tracks?: { items?: { duration_ms?: number }[] };
  };
  const duration_ms = (data.tracks?.items ?? []).reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  return { ...data, duration_ms };
}

export async function fetchRelatedArtistsOptional(
  token: string,
  spotifyArtistId: string,
): Promise<SpotifyRelatedArtist[] | null> {
  try {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/artists/${spotifyArtistId}/related-artists`,
      token,
    );
    if (res.status === 403) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { artists?: SpotifyRelatedArtist[] };
    return data.artists ?? [];
  } catch {
    return null;
  }
}

export async function fetchAudioFeaturesBatchOptional(
  token: string,
  trackIds: string[],
): Promise<Record<string, SpotifyAudioFeatures>> {
  const out: Record<string, SpotifyAudioFeatures> = {};
  if (trackIds.length === 0) return out;
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100);
    try {
      const res = await spotifyFetch(`${SPOTIFY_API}/audio-features?ids=${chunk.join(',')}`, token);
      if (res.status === 403) return {};
      if (!res.ok) continue;
      const data = (await res.json()) as {
        audio_features?: ((SpotifyAudioFeatures & { id: string }) | null)[];
      };
      for (const f of data.audio_features ?? []) {
        if (f?.id) out[f.id] = f;
      }
    } catch {}
  }
  return out;
}

export async function fetchUserTopTracksOptional(
  token: string,
  limit = 50,
): Promise<{ id: string; artists: { id: string; name: string }[] }[]> {
  try {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/me/top/tracks?limit=${limit}&time_range=medium_term`,
      token,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: { id: string; artists: { id: string; name: string }[] }[];
    };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function getServiceSpotifyToken(): Promise<string> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('missing_spotify_credentials');
  const res = await fetchWithTimeout(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    SPOTIFY_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`spotify_client_creds_failed:${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
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

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\b(remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const BASE = 'https://ws.audioscrobbler.com/2.0/';
const RATE_LIMIT_MS = 200;
const LASTFM_FETCH_TIMEOUT_MS = 8_000;
let lastCallAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < RATE_LIMIT_MS) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  lastCallAt = Date.now();
}

async function lastfmFetch<T = unknown>(params: Record<string, string>): Promise<T> {
  const key = Deno.env.get('LASTFM_API_KEY');
  if (!key) throw new Error('missing_lastfm_key');
  await throttle();
  const url = new URL(BASE);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: { 'User-Agent': Deno.env.get('LASTFM_USER_AGENT') ?? 'AlbumOfTheDay/1.0' },
    },
    LASTFM_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`lastfm_failed:${res.status}`);
  return (await res.json()) as T;
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

export type LastfmSimilarArtist = { name: string; mbid?: string; match: number };

export async function fetchSimilarArtists(
  artistName: string,
  mbid?: string,
): Promise<LastfmSimilarArtist[]> {
  const data = await lastfmFetch<{
    similarartists?: { artist?: { name: string; mbid?: string; match: string }[] };
  }>({
    method: 'artist.getsimilar',
    ...(mbid ? { mbid } : { artist: artistName }),
    autocorrect: '1',
    limit: '30',
  });
  return (data.similarartists?.artist ?? []).map((a) => ({
    name: a.name,
    mbid: a.mbid || undefined,
    match: Number.parseFloat(a.match) || 0,
  }));
}

export type LastfmTopAlbum = {
  name: string;
  artist: string;
  mbid?: string;
  playcount?: number;
};

export async function fetchTopAlbumsForArtist(
  artistName: string,
  limit = 5,
): Promise<LastfmTopAlbum[]> {
  const data = await lastfmFetch<{
    topalbums?: {
      album?: { name: string; artist: { name: string }; mbid?: string; playcount?: string }[];
    };
  }>({
    method: 'artist.gettopalbums',
    artist: artistName,
    autocorrect: '1',
    limit: String(limit),
  });
  return (data.topalbums?.album ?? [])
    .filter((a) => a.name && a.name !== '(null)')
    .map((a) => ({
      name: a.name,
      artist: a.artist.name,
      mbid: a.mbid || undefined,
      playcount: a.playcount ? Number(a.playcount) : undefined,
    }));
}

export async function fetchAlbumInfo(
  artist: string,
  album: string,
): Promise<{
  listeners?: number;
  playcount?: number;
  mbid?: string;
  url?: string;
} | null> {
  try {
    const data = await lastfmFetch<{
      album?: { listeners?: string; playcount?: string; mbid?: string; url?: string };
    }>({
      method: 'album.getinfo',
      artist,
      album,
      autocorrect: '1',
    });
    if (!data.album) return null;
    return {
      listeners: data.album.listeners ? Number(data.album.listeners) : undefined,
      playcount: data.album.playcount ? Number(data.album.playcount) : undefined,
      mbid: data.album.mbid || undefined,
      url: data.album.url,
    };
  } catch {
    return null;
  }
}

export async function fetchGloballyTopAlbums(
  limit = 500,
  opts: {
    artistOffset?: number;
    topAlbumsForArtist?: typeof fetchTopAlbumsForArtist;
  } = {},
): Promise<
  {
    name: string;
    artist: string;
    playcount?: number;
  }[]
> {
  const artistOffset = Math.max(0, opts.artistOffset ?? 0);
  const data = await lastfmFetch<{ artists?: { artist?: { name: string }[] } }>({
    method: 'chart.gettopartists',
    limit: '100',
  });
  const out: { name: string; artist: string; playcount?: number }[] = [];
  const artists = (data.artists?.artist ?? []).slice(artistOffset);
  for (const a of artists) {
    if (out.length >= limit) break;
    try {
      const tops = await (opts.topAlbumsForArtist ?? fetchTopAlbumsForArtist)(a.name, 5);
      for (const al of tops) {
        out.push({ name: al.name, artist: a.name, playcount: al.playcount });
        if (out.length >= limit) break;
      }
    } catch {
      // Optional chart source: skip this artist if Last.fm cannot return top albums.
    }
  }
  return out;
}

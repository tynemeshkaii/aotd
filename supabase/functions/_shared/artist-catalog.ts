import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from './album-dedupe.ts';
import type { AlbumCandidate, CandidateExclusions } from './candidate-generation.ts';
import {
  assertExternalApiCircuitAllows,
  recordExternalApiCircuitFailure,
  recordExternalApiCircuitSuccess,
} from './external-api-breaker.ts';
import { recordExternalApiCall } from './external-api-log.ts';
import { reserveExternalApiSlot } from './external-api-rate-limit.ts';
import { isRecommendationReleaseLike } from './release-eligibility.ts';
import { spotifyFetch } from './spotify-extended.ts';
import type { TasteSignal, UserArtist } from './taste-extraction.ts';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const ARTIST_ALBUMS_INTERVAL_MS = 1_250;
const DEV_MODE_429_MIN_COOLDOWN_SECONDS = 15 * 60;

export type SpotifyArtistAlbum = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; height?: number; width?: number }[];
  total_tracks: number;
  album_type: string;
  release_date: string;
};

export interface FamiliarCatalogOpts {
  maxSourceArtists?: number;
  maxAlbumsPerArtist?: number;
  market?: string;
  userId?: string;
  requestContext?: string;
}

export async function fetchArtistAlbums(
  token: string,
  artistId: string,
  market = 'US',
  opts: { limit?: number; pageCap?: number } = {},
): Promise<SpotifyArtistAlbum[]> {
  const limit = opts.limit ?? 50;
  const pageCap = opts.pageCap ?? 2;
  const out: SpotifyArtistAlbum[] = [];
  let url: string | null =
    `${SPOTIFY_API}/artists/${artistId}/albums?include_groups=album,single&market=${market}&limit=${limit}`;
  let pages = 0;

  while (url && pages < pageCap) {
    const res = await spotifyFetch(url, token);
    if (!res.ok) {
      throw new Error(`artist_albums_failed:${res.status}`);
    }
    const data = (await res.json()) as {
      items?: SpotifyArtistAlbum[];
      next?: string | null;
    };
    out.push(...(data.items ?? []));
    url = data.next ?? null;
    pages += 1;
  }
  return out;
}

export function buildFamiliarCandidatesFromAlbums(
  albums: SpotifyArtistAlbum[],
  sourceArtist: UserArtist,
  exclusions: CandidateExclusions,
  maxAlbumsPerArtist: number,
  seenSpotifyIds: Set<string>,
  seenNormalizedKeys: Set<string>,
): AlbumCandidate[] {
  const candidates: AlbumCandidate[] = [];
  let albumsAccepted = 0;

  for (const album of albums) {
    if (albumsAccepted >= maxAlbumsPerArtist) break;
    if (seenSpotifyIds.has(album.id)) continue;
    if (exclusions.spotifyAlbumIds.has(album.id)) continue;

    // Only accept albums where the source artist is the primary artist.
    // Spotify /artists/{id}/albums can return collaborations where the
    // requested artist is secondary or featured; skip those.
    if (album.artists[0]?.id !== sourceArtist.spotify_id) continue;

    const primaryArtistName = album.artists[0]?.name ?? sourceArtist.name;
    const normalizedKey = normalizeAlbumKey(primaryArtistName, album.name);
    if (seenNormalizedKeys.has(normalizedKey)) continue;
    if (exclusions.normalizedAlbumKeys.has(normalizedKey)) continue;

    if (!isRecommendationReleaseLike(album)) continue;

    seenSpotifyIds.add(album.id);
    seenNormalizedKeys.add(normalizedKey);
    albumsAccepted += 1;

    candidates.push({
      spotify_id: album.id,
      title: album.name,
      primary_artist_name: primaryArtistName,
      primary_artist_spotify_id: album.artists[0]?.id,
      cover_url: album.images[0]?.url,
      total_tracks: album.total_tracks,
      release_year: parseYear(album.release_date),
      album_type: album.album_type,
      best_similarity_match: 1.0,
      source_paths: [
        {
          source_artist: sourceArtist,
          similar_match: 1.0,
        },
      ],
      // Decision #4: leave lastfm_listeners undefined — do not fetch Last.fm during warm.
    });
  }

  return candidates;
}

export async function generateFamiliarCatalogCandidates(
  admin: SupabaseClient,
  token: string,
  taste: TasteSignal,
  exclusions: CandidateExclusions,
  recentArtistsToAvoid: Set<string>,
  opts: FamiliarCatalogOpts = {},
): Promise<AlbumCandidate[]> {
  const maxSourceArtists = opts.maxSourceArtists ?? 8;
  const maxAlbumsPerArtist = opts.maxAlbumsPerArtist ?? 3;
  const market = opts.market ?? 'US';
  const requestContext = opts.requestContext ?? 'familiar_catalog';

  const sourceArtists = taste.topArtists
    .filter((a): a is UserArtist & { spotify_id: string } => !!a.spotify_id)
    .slice(0, maxSourceArtists);

  const candidates: AlbumCandidate[] = [];
  const seenSpotifyIds = new Set<string>(exclusions.spotifyAlbumIds);
  const seenNormalizedKeys = new Set<string>(exclusions.normalizedAlbumKeys);

  for (const sourceArtist of sourceArtists) {
    if (recentArtistsToAvoid.has(sourceArtist.name)) continue;

    await assertExternalApiCircuitAllows(admin, 'spotify', 'artist_albums');
    await reserveExternalApiSlot(admin, 'spotify', 'artist_albums', ARTIST_ALBUMS_INTERVAL_MS);

    const startedAt = Date.now();
    let albums: SpotifyArtistAlbum[];
    try {
      albums = await fetchArtistAlbums(token, sourceArtist.spotify_id, market, {
        pageCap: 2,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = extractStatusFromError(e);
      await recordExternalApiCall(admin, {
        service: 'spotify',
        endpoint: 'artist_albums',
        status: status ?? null,
        ok: false,
        duration_ms: Date.now() - startedAt,
        error_code: msg,
        request_context: requestContext,
        user_id: opts.userId ?? null,
      });
      const isRateLimited = status === 429;
      const isServerUnavailable = status !== null && status >= 500;
      const shouldFailClosed = isRateLimited || isServerUnavailable || status === null;
      if (shouldFailClosed) {
        const retrySeconds = isRateLimited
          ? Math.max(
              (e instanceof Error && msg.includes('Retry-After') ? parseRetryAfter(msg) : null) ??
                0,
              DEV_MODE_429_MIN_COOLDOWN_SECONDS,
            )
          : DEV_MODE_429_MIN_COOLDOWN_SECONDS;
        await recordExternalApiCircuitFailure(admin, 'spotify', 'artist_albums', {
          status,
          error: msg,
          cooldownSeconds: retrySeconds,
        });
      }
      continue;
    }

    await recordExternalApiCall(admin, {
      service: 'spotify',
      endpoint: 'artist_albums',
      status: 200,
      ok: true,
      duration_ms: Date.now() - startedAt,
      request_context: requestContext,
      user_id: opts.userId ?? null,
    });
    await recordExternalApiCircuitSuccess(admin, 'spotify', 'artist_albums');

    const batch = buildFamiliarCandidatesFromAlbums(
      albums,
      sourceArtist,
      exclusions,
      maxAlbumsPerArtist,
      seenSpotifyIds,
      seenNormalizedKeys,
    );
    candidates.push(...batch);
  }

  return candidates;
}

function parseYear(d: string): number | undefined {
  const y = Number.parseInt(d?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) ? y : undefined;
}

function extractStatusFromError(e: unknown): number | null {
  if (e instanceof Error) {
    const match = e.message.match(/:(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseRetryAfter(msg: string): number | null {
  const match = msg.match(/Retry-After[:\s]*(\d+)/i);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

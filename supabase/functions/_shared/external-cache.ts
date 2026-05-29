import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSimilarArtists, type LastfmSimilarArtist } from './lastfm.ts';
import {
  fetchAudioFeaturesBatchOptional,
  fetchRelatedArtistsOptional,
  type SpotifyAudioFeatures,
  type SpotifyRelatedArtist,
} from './spotify-extended.ts';

const SIMILARITY_TTL_DAYS = 30;
const AUDIO_FEATURES_TTL_DAYS = 180;

export function normalizeArtistName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function buildArtistKey(spotifyId: string | null | undefined, name: string): string {
  if (spotifyId) return `spotify:${spotifyId}`;
  return `lastfm:${normalizeArtistName(name)}`;
}

export async function getLastfmSimilarCached(
  admin: SupabaseClient,
  artistName: string,
  spotifyId?: string | null,
): Promise<LastfmSimilarArtist[]> {
  const key = buildArtistKey(spotifyId, artistName);
  const { data: cached } = await admin
    .from('artist_similarity_cache')
    .select('similar_artists, fetched_at')
    .eq('source', 'lastfm')
    .eq('source_artist_key', key)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, SIMILARITY_TTL_DAYS)) {
    return cached.similar_artists as LastfmSimilarArtist[];
  }

  const fresh = await fetchSimilarArtists(artistName);
  await admin.from('artist_similarity_cache').upsert(
    {
      source: 'lastfm',
      source_artist_key: key,
      source_artist_name: artistName,
      similar_artists: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,source_artist_key' },
  );
  return fresh;
}

export async function getSpotifyRelatedCached(
  admin: SupabaseClient,
  spotifyToken: string,
  spotifyArtistId: string,
  artistName: string,
): Promise<SpotifyRelatedArtist[] | null> {
  const key = buildArtistKey(spotifyArtistId, artistName);
  const { data: cached } = await admin
    .from('artist_similarity_cache')
    .select('similar_artists, fetched_at')
    .eq('source', 'spotify')
    .eq('source_artist_key', key)
    .maybeSingle();

  if (cached && !isStale(cached.fetched_at, SIMILARITY_TTL_DAYS)) {
    return cached.similar_artists as SpotifyRelatedArtist[];
  }

  const fresh = await fetchRelatedArtistsOptional(spotifyToken, spotifyArtistId);
  if (fresh === null) return null;

  await admin.from('artist_similarity_cache').upsert(
    {
      source: 'spotify',
      source_artist_key: key,
      source_artist_name: artistName,
      similar_artists: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'source,source_artist_key' },
  );
  return fresh;
}

export async function getAudioFeaturesCached(
  admin: SupabaseClient,
  spotifyToken: string,
  trackIds: string[],
): Promise<Record<string, SpotifyAudioFeatures>> {
  if (trackIds.length === 0) return {};
  const { data: cached } = await admin
    .from('audio_features_cache')
    .select('spotify_track_id, features, fetched_at')
    .in('spotify_track_id', trackIds);

  const out: Record<string, SpotifyAudioFeatures> = {};
  const cachedIds = new Set<string>();
  for (const row of cached ?? []) {
    if (!isStale(row.fetched_at, AUDIO_FEATURES_TTL_DAYS)) {
      out[row.spotify_track_id] = row.features as SpotifyAudioFeatures;
      cachedIds.add(row.spotify_track_id);
    }
  }
  const missing = trackIds.filter((id) => !cachedIds.has(id));
  if (missing.length === 0) return out;

  const fresh = await fetchAudioFeaturesBatchOptional(spotifyToken, missing);
  const rows: { spotify_track_id: string; features: SpotifyAudioFeatures; fetched_at: string }[] =
    [];
  for (const [id, f] of Object.entries(fresh)) {
    out[id] = f;
    rows.push({ spotify_track_id: id, features: f, fetched_at: new Date().toISOString() });
  }
  if (rows.length > 0) {
    await admin.from('audio_features_cache').upsert(rows, { onConflict: 'spotify_track_id' });
  }
  return out;
}

function isStale(fetchedAt: string, ttlDays: number) {
  return Date.now() - new Date(fetchedAt).getTime() > ttlDays * 24 * 60 * 60 * 1000;
}

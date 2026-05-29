import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from './album-dedupe.ts';
import type { AlbumCandidate, CandidateExclusions } from './candidate-generation.ts';
import { buildArtistKey, normalizeArtistName } from './external-cache.ts';
import { popularityBucket } from './popularity-bucket.ts';
import type { TasteSignal, UserArtist } from './taste-extraction.ts';

export type RecommendationCandidateRow = {
  source: 'lastfm' | 'spotify';
  source_artist_key: string;
  source_artist_name: string;
  candidate_artist_name: string;
  candidate_artist_spotify_id: string | null;
  candidate_album_name: string;
  spotify_album_id: string | null;
  mb_release_group_id: string | null;
  album_type: string | null;
  total_tracks: number | null;
  duration_ms: number | null;
  release_year: number | null;
  cover_url: string | null;
  lastfm_listeners: number | null;
  lastfm_playcount: number | null;
  similarity_match: number | null;
  popularity_bucket: string | null;
  eligibility_status: string;
  rejection_reason: string | null;
  resolved_at: string | null;
  fetched_at: string;
  next_retry_at: string | null;
};

type SourcePath = { source_artist: UserArtist; similar_match: number };

export function sourceArtistKeys(taste: TasteSignal, limit: number) {
  return taste.topArtists.slice(0, limit).map((artist) => ({
    artist,
    key: buildArtistKey(artist.spotify_id, artist.name),
  }));
}

export async function loadCachedCandidates(
  admin: SupabaseClient,
  taste: TasteSignal,
  sourceArtistLimit: number,
  exclusions: CandidateExclusions,
  recentArtistsToAvoid: Set<string>,
): Promise<AlbumCandidate[]> {
  const sourceKeys = sourceArtistKeys(taste, sourceArtistLimit);
  if (sourceKeys.length === 0) return [];

  const artistByKey = new Map(sourceKeys.map(({ key, artist }) => [key, artist]));
  const { data, error } = await admin
    .from('recommendation_candidates')
    .select(
      'source, source_artist_key, source_artist_name, candidate_artist_name, candidate_artist_spotify_id, candidate_album_name, spotify_album_id, mb_release_group_id, album_type, total_tracks, duration_ms, release_year, cover_url, lastfm_listeners, lastfm_playcount, similarity_match, popularity_bucket, eligibility_status, rejection_reason, resolved_at, fetched_at, next_retry_at',
    )
    .in(
      'source_artist_key',
      sourceKeys.map(({ key }) => key),
    )
    .eq('eligibility_status', 'eligible')
    .not('spotify_album_id', 'is', null);

  if (error) throw new Error(`candidate_cache_load_failed:${error.message}`);

  return aggregateCandidateRows(
    ((data ?? []) as RecommendationCandidateRow[]).filter((row) =>
      rowPassesExclusions(row, exclusions, recentArtistsToAvoid),
    ),
    artistByKey,
  );
}

export async function writeCandidatesToCache(
  admin: SupabaseClient,
  candidates: AlbumCandidate[],
  source: 'lastfm' | 'spotify' = 'lastfm',
) {
  const rows = await prepareCandidateCacheRows(admin, candidates, source);
  if (rows.length === 0) return;

  const { error } = await admin.from('recommendation_candidates').upsert(rows, {
    onConflict: 'source,source_artist_key,candidate_artist_name,candidate_album_name',
  });
  if (error) throw new Error(`candidate_cache_write_failed:${error.message}`);
}

export async function newestCandidateFetchedAt(
  admin: SupabaseClient,
  sourceKeys: string[],
): Promise<string | null> {
  if (sourceKeys.length === 0) return null;
  const { data, error } = await admin
    .from('recommendation_candidates')
    .select('fetched_at')
    .in('source_artist_key', sourceKeys)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`candidate_cache_freshness_failed:${error.message}`);
  return data?.fetched_at ?? null;
}

export async function countEligibleCachedCandidates(
  admin: SupabaseClient,
  sourceKeys: string[],
): Promise<number> {
  if (sourceKeys.length === 0) return 0;
  const { data, error } = await admin
    .from('recommendation_candidates')
    .select('spotify_album_id')
    .in('source_artist_key', sourceKeys)
    .eq('eligibility_status', 'eligible')
    .not('spotify_album_id', 'is', null);
  if (error) throw new Error(`candidate_cache_count_failed:${error.message}`);
  return new Set(
    ((data ?? []) as { spotify_album_id: string }[]).map((row) => row.spotify_album_id),
  ).size;
}

export async function pendingRetrySourceKeys(
  admin: SupabaseClient,
  sourceKeys: string[],
): Promise<Set<string>> {
  if (sourceKeys.length === 0) return new Set();
  const { data, error } = await admin
    .from('recommendation_candidates')
    .select('source_artist_key')
    .in('source_artist_key', sourceKeys)
    .in('eligibility_status', ['unresolved', 'spotify_unavailable'])
    .lte('next_retry_at', new Date().toISOString());
  if (error) throw new Error(`candidate_cache_retry_failed:${error.message}`);
  return new Set(
    ((data ?? []) as { source_artist_key: string }[]).map((row) => row.source_artist_key),
  );
}

function aggregateCandidateRows(
  rows: RecommendationCandidateRow[],
  artistByKey: Map<string, UserArtist>,
): AlbumCandidate[] {
  const bySpotifyId = new Map<string, AlbumCandidate>();
  for (const row of rows) {
    if (!row.spotify_album_id) continue;
    const sourceArtist =
      artistByKey.get(row.source_artist_key) ??
      ({
        spotify_id: null,
        name: row.source_artist_name,
        frequency: 1,
      } satisfies UserArtist);
    const path: SourcePath = {
      source_artist: sourceArtist,
      similar_match: row.similarity_match ?? 0,
    };

    const existing = bySpotifyId.get(row.spotify_album_id);
    if (existing) {
      if (
        !existing.source_paths.some(
          (p) =>
            buildArtistKey(p.source_artist.spotify_id, p.source_artist.name) ===
            row.source_artist_key,
        )
      ) {
        existing.source_paths.push(path);
      }
      existing.best_similarity_match = Math.max(
        existing.best_similarity_match,
        row.similarity_match ?? 0,
      );
      continue;
    }

    bySpotifyId.set(row.spotify_album_id, {
      spotify_id: row.spotify_album_id,
      mb_release_group_id: row.mb_release_group_id ?? undefined,
      title: row.candidate_album_name,
      primary_artist_name: row.candidate_artist_name,
      primary_artist_spotify_id: row.candidate_artist_spotify_id ?? undefined,
      cover_url: row.cover_url ?? undefined,
      total_tracks: row.total_tracks ?? 0,
      duration_ms: row.duration_ms ?? undefined,
      release_year: row.release_year ?? undefined,
      album_type: row.album_type ?? undefined,
      lastfm_listeners: row.lastfm_listeners ?? undefined,
      lastfm_playcount: row.lastfm_playcount ?? undefined,
      best_similarity_match: row.similarity_match ?? 0,
      source_paths: [path],
    });
  }
  return [...bySpotifyId.values()];
}

function rowPassesExclusions(
  row: RecommendationCandidateRow,
  exclusions: CandidateExclusions,
  recentArtistsToAvoid: Set<string>,
) {
  if (!row.spotify_album_id) return false;
  if (exclusions.spotifyAlbumIds.has(row.spotify_album_id)) return false;
  if (row.mb_release_group_id && exclusions.releaseGroupIds.has(row.mb_release_group_id)) {
    return false;
  }
  if (
    exclusions.normalizedAlbumKeys.has(
      normalizeAlbumKey(row.candidate_artist_name, row.candidate_album_name),
    )
  ) {
    return false;
  }
  const artistKey = normalizeArtistName(row.candidate_artist_name);
  for (const recent of recentArtistsToAvoid) {
    if (normalizeArtistName(recent) === artistKey) return false;
  }
  return true;
}

function candidateToRow(candidate: AlbumCandidate, path: SourcePath, source: 'lastfm' | 'spotify') {
  const sourceArtistKey = buildArtistKey(path.source_artist.spotify_id, path.source_artist.name);
  const listeners = candidate.lastfm_listeners ?? null;
  return {
    source,
    source_artist_key: sourceArtistKey,
    source_artist_name: path.source_artist.name,
    candidate_artist_name: candidate.primary_artist_name,
    candidate_artist_spotify_id: candidate.primary_artist_spotify_id ?? null,
    candidate_album_name: candidate.title,
    spotify_album_id: candidate.spotify_id,
    mb_release_group_id: candidate.mb_release_group_id ?? null,
    album_type: candidate.album_type ?? null,
    total_tracks: candidate.total_tracks,
    duration_ms: candidate.duration_ms ?? null,
    release_year: candidate.release_year ?? null,
    cover_url: candidate.cover_url ?? null,
    lastfm_listeners: listeners,
    lastfm_playcount: candidate.lastfm_playcount ?? null,
    similarity_match: path.similar_match,
    popularity_bucket: popularityBucket(listeners),
    eligibility_status: 'eligible',
    rejection_reason: null,
    resolved_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    next_retry_at: null,
  };
}

async function prepareCandidateCacheRows(
  admin: SupabaseClient,
  candidates: AlbumCandidate[],
  source: 'lastfm' | 'spotify',
) {
  const rows = candidates.flatMap((candidate) =>
    candidate.source_paths.map((path) => candidateToRow(candidate, path, source)),
  );
  const deduped = uniqueRowsByResolvedKey(rows);
  if (deduped.length === 0) return [];

  const sourceKeys = [...new Set(deduped.map((row) => row.source_artist_key))];
  const spotifyIds = [...new Set(deduped.map((row) => row.spotify_album_id).filter(isNonNull))];
  if (sourceKeys.length === 0 || spotifyIds.length === 0) return deduped;

  const { data, error } = await admin
    .from('recommendation_candidates')
    .select(
      'source, source_artist_key, candidate_artist_name, candidate_album_name, spotify_album_id',
    )
    .in('source_artist_key', sourceKeys)
    .in('spotify_album_id', spotifyIds);

  if (error) throw new Error(`candidate_cache_existing_load_failed:${error.message}`);

  const existingByResolvedKey = new Map(
    (
      (data ?? []) as {
        source: string;
        source_artist_key: string;
        candidate_artist_name: string;
        candidate_album_name: string;
        spotify_album_id: string;
      }[]
    ).map((row) => [resolvedRowKey(row), row]),
  );

  return deduped.filter((row) => {
    const existing = existingByResolvedKey.get(resolvedRowKey(row));
    if (!existing) return true;
    return (
      existing.source === row.source &&
      existing.candidate_artist_name === row.candidate_artist_name &&
      existing.candidate_album_name === row.candidate_album_name
    );
  });
}

function uniqueRowsByResolvedKey<T extends { source_artist_key: string; spotify_album_id: string }>(
  rows: T[],
) {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = resolvedRowKey(row);
    if (!out.has(key)) out.set(key, row);
  }
  return [...out.values()];
}

function resolvedRowKey(row: { source_artist_key: string; spotify_album_id: string }) {
  return `${row.source_artist_key}::${row.spotify_album_id}`;
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

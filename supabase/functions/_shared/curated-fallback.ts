import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from './album-dedupe.ts';
import { buildArtistKey } from './external-cache.ts';
import { isRecommendationReleaseLike } from './release-eligibility.ts';
import type { TasteSignal } from './taste-extraction.ts';
import { normalizeTasteArtistName } from './taste-filters.ts';

type UserLibraryFallbackRow = {
  provider_album_id: string | null;
  mb_release_group_id: string | null;
  album_name: string | null;
  artist_name: string | null;
};

type HistoryFallbackRow = {
  album_id: string;
  album: {
    spotify_id: string | null;
    mb_release_group_id: string | null;
    primary_artist_name: string | null;
    title: string | null;
  } | null;
};

type FallbackCandidateRow = {
  id: string;
  spotify_id: string;
  mb_release_group_id: string | null;
  title: string;
  lastfm_listeners: number | null;
  lastfm_playcount: number | null;
  primary_artist_name: string;
  release_year: number | null;
  album_type: string | null;
  total_tracks: number | null;
  duration_ms: number | null;
};

type RecentPickRow = {
  album: { primary_artist_name: string | null } | null;
};

export async function getCuratedFallback(
  admin: SupabaseClient,
  userId: string,
  taste?: TasteSignal,
): Promise<{ album_id: string } | null> {
  const { data: lib } = await admin
    .from('user_library')
    .select('provider_album_id, mb_release_group_id, album_name, artist_name')
    .eq('user_id', userId)
    .is('removed_at', null);
  const libRows = (lib ?? []) as UserLibraryFallbackRow[];

  const { data: history } = await admin
    .from('recommendation_history')
    .select('album_id, album:albums(spotify_id, mb_release_group_id, primary_artist_name, title)')
    .eq('user_id', userId);
  const historyRows = (history ?? []) as HistoryFallbackRow[];

  const libSpotifyIds = new Set<string>();
  const usedAlbumIds = new Set<string>();
  const excludedReleaseGroups = new Set<string>();
  const excludedAlbumKeys = new Set<string>();

  for (const row of libRows) {
    if (isNonEmptyString(row.provider_album_id)) libSpotifyIds.add(row.provider_album_id);
    if (isNonEmptyString(row.mb_release_group_id))
      excludedReleaseGroups.add(row.mb_release_group_id);
    addNormalizedKey(excludedAlbumKeys, row.artist_name, row.album_name);
  }

  for (const row of historyRows) {
    usedAlbumIds.add(row.album_id);
    if (!row.album) continue;
    if (isNonEmptyString(row.album.spotify_id)) libSpotifyIds.add(row.album.spotify_id);
    if (isNonEmptyString(row.album.mb_release_group_id)) {
      excludedReleaseGroups.add(row.album.mb_release_group_id);
    }
    addNormalizedKey(excludedAlbumKeys, row.album.primary_artist_name, row.album.title);
  }

  const { data: candidates } = await admin
    .from('albums')
    .select(
      'id, spotify_id, mb_release_group_id, title, lastfm_listeners, lastfm_playcount, primary_artist_name, release_year, album_type, total_tracks, duration_ms',
    )
    .eq('is_prewarm_seed', true)
    .order('lastfm_listeners', { ascending: false, nullsFirst: false })
    .order('lastfm_playcount', { ascending: false, nullsFirst: false })
    .limit(300);

  const { data: recentPicks } = await admin
    .from('albums_of_the_day')
    .select('album:albums(primary_artist_name)')
    .eq('user_id', userId)
    .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const recentArtists = new Set(
    ((recentPicks ?? []) as RecentPickRow[])
      .map((r) => r.album?.primary_artist_name?.toLowerCase().trim())
      .filter(isNonEmptyString),
  );

  const eligible = ((candidates ?? []) as FallbackCandidateRow[]).filter(
    (c) =>
      !libSpotifyIds.has(c.spotify_id) &&
      !usedAlbumIds.has(c.id) &&
      (!c.mb_release_group_id || !excludedReleaseGroups.has(c.mb_release_group_id)) &&
      !excludedAlbumKeys.has(normalizeAlbumKey(c.primary_artist_name, c.title)) &&
      !recentArtists.has(c.primary_artist_name.toLowerCase().trim()) &&
      isRecommendationReleaseLike(c),
  );

  if (eligible.length === 0) return null;
  const pick = await selectFallbackCandidate(admin, eligible, taste);
  return { album_id: pick.id };
}

async function selectFallbackCandidate(
  admin: SupabaseClient,
  eligible: FallbackCandidateRow[],
  taste: TasteSignal | undefined,
): Promise<FallbackCandidateRow> {
  const affinity = taste ? await buildArtistAffinity(admin, taste) : new Map<string, number>();
  if (affinity.size === 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  const popularity = eligible.map((c) =>
    Math.log((c.lastfm_listeners ?? c.lastfm_playcount ?? 0) + 1),
  );
  const maxPopularity = Math.max(1, ...popularity);
  const scored = eligible
    .map((candidate, idx) => {
      const artistKey = normalizeTasteArtistName(candidate.primary_artist_name);
      const artistAffinity = affinity.get(artistKey) ?? 0;
      const decadeAffinity = releaseDecadeAffinity(candidate, taste);
      const popularityScore = popularity[idx] / maxPopularity;
      return {
        candidate,
        score: artistAffinity * 0.72 + decadeAffinity * 0.18 + popularityScore * 0.1,
      };
    })
    .sort((a, b) => b.score - a.score);

  const meaningful = scored.filter((item) => item.score > 0.12);
  const pool = meaningful.length > 0 ? meaningful.slice(0, 40) : scored.slice(0, 40);
  const total = pool.reduce((sum, item) => sum + Math.max(0.01, item.score), 0);
  let cursor = Math.random() * total;
  for (const item of pool) {
    cursor -= Math.max(0.01, item.score);
    if (cursor <= 0) return item.candidate;
  }
  return pool[pool.length - 1].candidate;
}

async function buildArtistAffinity(
  admin: SupabaseClient,
  taste: TasteSignal,
): Promise<Map<string, number>> {
  const sourceArtists = taste.topArtists.slice(0, 15);
  const affinity = new Map<string, number>();
  const cacheKeys = sourceArtists.map((artist) => buildArtistKey(artist.spotify_id, artist.name));
  const { data: cachedRows } =
    cacheKeys.length > 0
      ? await admin
          .from('artist_similarity_cache')
          .select('source_artist_key, similar_artists')
          .eq('source', 'lastfm')
          .in('source_artist_key', cacheKeys)
      : { data: [] };
  const cacheByKey = new Map(
    ((cachedRows ?? []) as { source_artist_key: string; similar_artists: unknown }[]).map((row) => [
      row.source_artist_key,
      row.similar_artists,
    ]),
  );

  for (const [idx, artist] of sourceArtists.entries()) {
    const sourceWeight =
      Math.log(artist.frequency + 1) / Math.max(1, Math.log(taste.librarySize + 1));
    const directKey = normalizeTasteArtistName(artist.name);
    affinity.set(directKey, Math.max(affinity.get(directKey) ?? 0, 1 + sourceWeight));

    const cacheKey = buildArtistKey(artist.spotify_id, artist.name);
    const cached = cacheByKey.get(cacheKey);
    const similarArtists = Array.isArray(cached)
      ? (cached as { name?: string; match?: number }[])
      : [];
    for (const similar of similarArtists.slice(0, 30)) {
      if (!similar.name) continue;
      const key = normalizeTasteArtistName(similar.name);
      const match = typeof similar.match === 'number' ? similar.match : 0;
      const rankPenalty = Math.max(0.35, 1 - idx * 0.04);
      const score = Math.max(0, match) * rankPenalty + sourceWeight * 0.2;
      affinity.set(key, Math.max(affinity.get(key) ?? 0, score));
    }
  }

  return affinity;
}

function releaseDecadeAffinity(candidate: FallbackCandidateRow, taste: TasteSignal | undefined) {
  if (!taste || !candidate.release_year) return 0.25;
  const decade = String(Math.floor(candidate.release_year / 10) * 10);
  return taste.libraryDecadeFractions[decade] ?? 0;
}

function addNormalizedKey(
  keys: Set<string>,
  artist: string | null | undefined,
  album: string | null | undefined,
) {
  if (!isNonEmptyString(artist) || !isNonEmptyString(album)) return;
  keys.add(normalizeAlbumKey(artist, album));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

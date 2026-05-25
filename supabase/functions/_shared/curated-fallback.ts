import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAlbumKey } from './album-dedupe.ts';

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
};

type RecentPickRow = {
  album: { primary_artist_name: string | null } | null;
};

export async function getCuratedFallback(
  admin: SupabaseClient,
  userId: string,
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
      'id, spotify_id, mb_release_group_id, title, lastfm_listeners, lastfm_playcount, primary_artist_name',
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
      !recentArtists.has(c.primary_artist_name.toLowerCase().trim()),
  );

  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return { album_id: pick.id };
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

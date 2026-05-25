import type { SpotifySavedAlbum, SpotifySavedTrack } from './spotify.ts';

export const TRACK_THRESHOLD = 4;

export type AggregatedAlbum = {
  provider_album_id: string;
  album_name: string;
  artist_name: string;
  artist_ids: { id: string; name: string }[];
  cover_url: string | null;
  total_tracks: number | null;
  release_year: number | null;
  added_at_provider: string | null;
  source: { saved_album: boolean; saved_tracks_count: number };
};

export function aggregateLibrary(
  savedAlbums: SpotifySavedAlbum[],
  savedTracks: SpotifySavedTrack[],
): AggregatedAlbum[] {
  const map = new Map<string, AggregatedAlbum>();

  for (const item of savedAlbums) {
    const a = item.album;
    map.set(a.id, {
      provider_album_id: a.id,
      album_name: a.name,
      artist_name: a.artists[0]?.name ?? 'Unknown',
      artist_ids: a.artists.map((ar) => ({ id: ar.id, name: ar.name })),
      cover_url: a.images[0]?.url ?? null,
      total_tracks: a.total_tracks ?? null,
      release_year: parseReleaseYear(a.release_date),
      added_at_provider: item.added_at,
      source: { saved_album: true, saved_tracks_count: 0 },
    });
  }

  for (const item of savedTracks) {
    const a = item.track.album;
    const existing = map.get(a.id);
    if (existing) {
      existing.source.saved_tracks_count += 1;
    } else {
      map.set(a.id, {
        provider_album_id: a.id,
        album_name: a.name,
        artist_name: a.artists[0]?.name ?? 'Unknown',
        artist_ids: a.artists.map((ar) => ({ id: ar.id, name: ar.name })),
        cover_url: a.images[0]?.url ?? null,
        total_tracks: a.total_tracks ?? null,
        release_year: parseReleaseYear(a.release_date),
        added_at_provider: null,
        source: { saved_album: false, saved_tracks_count: 1 },
      });
    }
  }

  return Array.from(map.values()).filter(
    (a) => a.source.saved_album || a.source.saved_tracks_count >= TRACK_THRESHOLD,
  );
}

function parseReleaseYear(releaseDate: string): number | null {
  const year = Number.parseInt(releaseDate?.slice(0, 4) ?? '', 10);
  return Number.isFinite(year) ? year : null;
}

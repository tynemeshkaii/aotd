import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { aggregateLibrary, TRACK_THRESHOLD } from './library-aggregation.ts';
import type { SpotifySavedAlbum, SpotifySavedTrack } from './spotify.ts';

function makeAlbum(opts: {
  id?: string;
  name?: string;
  artist?: { id: string; name: string };
  artists?: { id: string; name: string }[];
  releaseDate?: string;
  totalTracks?: number;
  imageUrl?: string;
}): SpotifySavedAlbum['album'] {
  return {
    id: opts.id ?? 'album-1',
    name: opts.name ?? 'Test Album',
    artists: opts.artists ?? [opts.artist ?? { id: 'artist-1', name: 'Test Artist' }],
    release_date: opts.releaseDate ?? '2023-06-15',
    total_tracks: opts.totalTracks ?? 10,
    images: opts.imageUrl ? [{ url: opts.imageUrl }] : [],
  };
}

function savedAlbum(
  album: SpotifySavedAlbum['album'],
  addedAt = '2023-06-15T12:00:00Z',
): SpotifySavedAlbum {
  return { added_at: addedAt, album };
}

function savedTrack(
  album: SpotifySavedAlbum['album'],
  addedAt = '2023-06-15T12:00:00Z',
): SpotifySavedTrack {
  return { added_at: addedAt, track: { album } };
}

Deno.test('aggregateLibrary: empty input returns empty', () => {
  assertEquals(aggregateLibrary([], []), []);
});

Deno.test('aggregateLibrary: saved album alone is included', () => {
  const album = makeAlbum({ id: 'a1', name: 'Album One' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result.length, 1);
  assertEquals(result[0].provider_album_id, 'a1');
  assertEquals(result[0].album_name, 'Album One');
  assertEquals(result[0].source.saved_album, true);
  assertEquals(result[0].source.saved_tracks_count, 0);
});

Deno.test('aggregateLibrary: album by saved tracks alone reaches threshold', () => {
  const album = makeAlbum({ id: 'a2', name: 'Track-Based' });
  const tracks: SpotifySavedTrack[] = Array.from({ length: TRACK_THRESHOLD }, (_, i) =>
    savedTrack(album, `2023-06-${String(15 + i).padStart(2, '0')}T12:00:00Z`),
  );
  const result = aggregateLibrary([], tracks);
  assertEquals(result.length, 1);
  assertEquals(result[0].source.saved_album, false);
  assertEquals(result[0].source.saved_tracks_count, TRACK_THRESHOLD);
});

Deno.test('aggregateLibrary: album by saved tracks below threshold is excluded', () => {
  const album = makeAlbum({ id: 'a3', name: 'Under Threshold' });
  const tracks: SpotifySavedTrack[] = Array.from({ length: TRACK_THRESHOLD - 1 }, (_, i) =>
    savedTrack(album, `2023-06-${String(15 + i).padStart(2, '0')}T12:00:00Z`),
  );
  const result = aggregateLibrary([], tracks);
  assertEquals(result.length, 0);
});

Deno.test('aggregateLibrary: exactly at threshold is included (boundary)', () => {
  // Reconfirm 4 specifically since it's the explicit constant.
  assertEquals(TRACK_THRESHOLD, 4);
  const album = makeAlbum({ id: 'boundary', name: 'Exactly 4' });
  const tracks: SpotifySavedTrack[] = Array.from({ length: 4 }, () => savedTrack(album));
  assertEquals(aggregateLibrary([], tracks).length, 1);
});

Deno.test('aggregateLibrary: 3 tracks excluded (under threshold)', () => {
  const album = makeAlbum({ id: 'below', name: 'Only 3' });
  const tracks: SpotifySavedTrack[] = Array.from({ length: 3 }, () => savedTrack(album));
  assertEquals(aggregateLibrary([], tracks).length, 0);
});

Deno.test('aggregateLibrary: saved album + saved tracks merges counts', () => {
  const album = makeAlbum({ id: 'a4', name: 'Combined' });
  const result = aggregateLibrary(
    [savedAlbum(album)],
    [savedTrack(album), savedTrack(album), savedTrack(album)],
  );
  assertEquals(result.length, 1);
  assertEquals(result[0].source.saved_album, true);
  assertEquals(result[0].source.saved_tracks_count, 3);
});

Deno.test('aggregateLibrary: tracks to album without saved album counter-increments', () => {
  const album = makeAlbum({ id: 'a5' });
  const tracks = [savedTrack(album), savedTrack(album), savedTrack(album)];
  // First track creates entry, next two increment.
  // But we only have 3 total — under threshold, so excluded.
  assertEquals(aggregateLibrary([], tracks).length, 0);

  // Add one more track to reach threshold.
  tracks.push(savedTrack(album));
  assertEquals(aggregateLibrary([], tracks).length, 1);
});

Deno.test('aggregateLibrary: multiple distinct albums from both sources', () => {
  const a1 = makeAlbum({ id: 'x1', name: 'Alpha' });
  const a2 = makeAlbum({ id: 'x2', name: 'Beta' });
  const a3 = makeAlbum({ id: 'x3', name: 'Gamma' });

  const result = aggregateLibrary(
    [savedAlbum(a1), savedAlbum(a2)],
    [
      savedTrack(a3),
      savedTrack(a3),
      savedTrack(a3),
      savedTrack(a3), // reaches threshold
      savedTrack(a2), // increments existing a2 entry
      savedTrack(makeAlbum({ id: 'loner', name: 'Single Track Only' })), // single track → excluded
    ],
  );

  assertEquals(result.length, 3);
  const ids = result.map((r) => r.provider_album_id).sort();
  assertEquals(ids, ['x1', 'x2', 'x3']);
});

Deno.test('aggregateLibrary: release year from YYYY-MM-DD', () => {
  const album = makeAlbum({ id: 'yr', releaseDate: '1999-05-23' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].release_year, 1999);
});

Deno.test('aggregateLibrary: release year from YYYY only', () => {
  const album = makeAlbum({ id: 'yr2', releaseDate: '2005' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].release_year, 2005);
});

Deno.test('aggregateLibrary: release year null on missing date', () => {
  const album = makeAlbum({ id: 'yr3', releaseDate: '' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].release_year, null);
});

Deno.test('aggregateLibrary: multiple artists preserved', () => {
  const album = makeAlbum({
    id: 'collab',
    artists: [
      { id: 'art-1', name: 'First' },
      { id: 'art-2', name: 'Second' },
      { id: 'art-3', name: 'Third' },
    ],
  });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].artist_name, 'First');
  assertEquals(result[0].artist_ids.length, 3);
  assertEquals(result[0].artist_ids[0].id, 'art-1');
  assertEquals(result[0].artist_ids[2].name, 'Third');
});

Deno.test('aggregateLibrary: cover URL from first image', () => {
  const album = makeAlbum({ id: 'cover', imageUrl: 'https://img.example.com/300.jpg' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].cover_url, 'https://img.example.com/300.jpg');
});

Deno.test('aggregateLibrary: cover URL null when no images', () => {
  const album = makeAlbum({ id: 'no-img' });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].cover_url, null);
});

Deno.test('aggregateLibrary: added_at from saved album', () => {
  const album = makeAlbum({ id: 'ts' });
  const result = aggregateLibrary([savedAlbum(album, '2024-01-01T08:00:00Z')], []);
  assert(result[0].added_at_provider !== null);
  assertEquals(result[0].added_at_provider, '2024-01-01T08:00:00Z');
});

Deno.test('aggregateLibrary: added_at null for track-only album', () => {
  const album = makeAlbum({ id: 'tracks-only' });
  const tracks: SpotifySavedTrack[] = Array.from({ length: TRACK_THRESHOLD }, () =>
    savedTrack(album),
  );
  const result = aggregateLibrary([], tracks);
  assertEquals(result[0].added_at_provider, null);
});

Deno.test('aggregateLibrary: total_tracks preserved from album', () => {
  const album = makeAlbum({ id: 'tt', totalTracks: 14 });
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].total_tracks, 14);
});

Deno.test('aggregateLibrary: total_tracks null when not on album object', () => {
  const album: SpotifySavedAlbum['album'] = {
    id: 'no-tt',
    name: 'No Track Count',
    artists: [{ id: 'a', name: 'A' }],
    images: [],
    release_date: '2024',
    // total_tracks intentionally omitted to simulate optional field
    total_tracks: undefined as unknown as number,
  };
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].total_tracks, null);
});

Deno.test('aggregateLibrary: unknown artist fallback when empty artists array', () => {
  const album: SpotifySavedAlbum['album'] = {
    id: 'no-artist',
    name: 'Unknown Artist Album',
    artists: [],
    images: [],
    release_date: '2024',
    total_tracks: 5,
  };
  const result = aggregateLibrary([savedAlbum(album)], []);
  assertEquals(result[0].artist_name, 'Unknown');
  assertEquals(result[0].artist_ids.length, 0);
});

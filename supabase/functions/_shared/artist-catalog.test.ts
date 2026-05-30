import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import {
  buildFamiliarCandidatesFromAlbums,
  fetchArtistAlbums,
  type SpotifyArtistAlbum,
} from './artist-catalog.ts';

const originalFetch = globalThis.fetch;

function makeSpotifyAlbum(
  overrides: Partial<SpotifyArtistAlbum> & { id: string; name: string },
): SpotifyArtistAlbum {
  return {
    id: overrides.id,
    name: overrides.name,
    artists: overrides.artists ?? [{ id: 'artist1', name: 'Test Artist' }],
    images: overrides.images ?? [{ url: 'http://example.com/cover.jpg' }],
    total_tracks: overrides.total_tracks ?? 10,
    album_type: overrides.album_type ?? 'album',
    release_date: overrides.release_date ?? '2020-01-01',
  };
}

Deno.test('fetchArtistAlbums respects pageCap', async () => {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : ((input as Request).url ?? (input as URL).href);
    const page = url.includes('offset=50') ? 1 : 0;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          items: [
            makeSpotifyAlbum({ id: `page${page}_1`, name: `Album ${page}A` }),
            makeSpotifyAlbum({ id: `page${page}_2`, name: `Album ${page}B` }),
          ],
          next: page === 0 ? url.replace('offset=0', 'offset=50') : null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof fetch;

  try {
    const result = await fetchArtistAlbums('token', 'artist123', 'US', { pageCap: 1 });
    assertEquals(result.length, 2);
    assertEquals(result[0].id, 'page0_1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('fetchArtistAlbums fetches up to pageCap pages', async () => {
  let callCount = 0;
  globalThis.fetch = (() => {
    callCount += 1;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          items: [makeSpotifyAlbum({ id: `album${callCount}`, name: `Album ${callCount}` })],
          next: callCount < 3 ? `http://next?page=${callCount}` : null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof fetch;

  try {
    const result = await fetchArtistAlbums('token', 'artist123', 'US', { pageCap: 2 });
    assertEquals(result.length, 2);
    assertEquals(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('buildFamiliarCandidatesFromAlbums filters by exclusions, release eligibility, and primary artist match', () => {
  const sourceArtist = { spotify_id: 'artist1', name: 'Test Artist', frequency: 5 };
  const albums = [
    makeSpotifyAlbum({ id: 'saved', name: 'Saved Album' }),
    makeSpotifyAlbum({
      id: 'single_bad',
      name: 'Bad Single',
      album_type: 'single',
      total_tracks: 1,
    }),
    makeSpotifyAlbum({ id: 'good1', name: 'Good Album 1' }),
    makeSpotifyAlbum({ id: 'good2', name: 'Good Album 2' }),
    makeSpotifyAlbum({ id: 'dup', name: 'Duplicate' }),
    makeSpotifyAlbum({
      id: 'collab',
      name: 'Collab Album',
      artists: [{ id: 'artist2', name: 'Other Artist' }],
    }),
  ];

  const exclusions = {
    spotifyAlbumIds: new Set<string>(['saved']),
    releaseGroupIds: new Set<string>(),
    normalizedAlbumKeys: new Set<string>(),
  };
  const seenSpotifyIds = new Set<string>();
  const seenNormalizedKeys = new Set<string>();

  const result = buildFamiliarCandidatesFromAlbums(
    albums,
    sourceArtist,
    exclusions,
    10,
    seenSpotifyIds,
    seenNormalizedKeys,
  );

  const ids = result.map((c) => c.spotify_id);
  assertEquals(ids.includes('saved'), false);
  assertEquals(ids.includes('single_bad'), false);
  assertEquals(ids.includes('collab'), false); // primary artist is not sourceArtist
  assertEquals(ids.includes('good1'), true);
  assertEquals(ids.includes('good2'), true);
  assertEquals(ids.includes('dup'), true);
});

Deno.test('buildFamiliarCandidatesFromAlbums dedupes by normalized key', () => {
  const sourceArtist = { spotify_id: 'artist1', name: 'Test Artist', frequency: 5 };

  // Case 1: different normalized keys — both accepted
  const albums1 = [
    makeSpotifyAlbum({ id: 'id1', name: 'Album (Deluxe Edition)' }),
    makeSpotifyAlbum({ id: 'id2', name: 'Other Album' }),
  ];
  const exclusions = {
    spotifyAlbumIds: new Set<string>(),
    releaseGroupIds: new Set<string>(),
    normalizedAlbumKeys: new Set<string>(),
  };
  const result1 = buildFamiliarCandidatesFromAlbums(
    albums1,
    sourceArtist,
    exclusions,
    10,
    new Set(),
    new Set(),
  );
  assertEquals(result1.length, 2);

  // Case 2: same normalized key — second deduped
  const albums2 = [
    makeSpotifyAlbum({ id: 'id1', name: 'Album (Deluxe)' }),
    makeSpotifyAlbum({ id: 'id2', name: 'Album' }),
  ];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result2 = buildFamiliarCandidatesFromAlbums(
    albums2,
    sourceArtist,
    exclusions,
    10,
    seenIds,
    seenKeys,
  );
  // "Album (Deluxe)" normalizes to "Album", so second should be deduped
  assertEquals(result2.length, 1);
  assertEquals(result2[0].spotify_id, 'id1');
});

Deno.test('buildFamiliarCandidatesFromAlbums respects maxAlbumsPerArtist', () => {
  const sourceArtist = { spotify_id: 'artist1', name: 'Test Artist', frequency: 5 };
  const albums = Array.from({ length: 10 }, (_, i) =>
    makeSpotifyAlbum({ id: `album${i}`, name: `Album ${i}` }),
  );

  const exclusions = {
    spotifyAlbumIds: new Set<string>(),
    releaseGroupIds: new Set<string>(),
    normalizedAlbumKeys: new Set<string>(),
  };
  const seenSpotifyIds = new Set<string>();
  const seenNormalizedKeys = new Set<string>();

  const result = buildFamiliarCandidatesFromAlbums(
    albums,
    sourceArtist,
    exclusions,
    3,
    seenSpotifyIds,
    seenNormalizedKeys,
  );

  assertEquals(result.length, 3);
});

Deno.test('buildFamiliarCandidatesFromAlbums sets similarity to 1.0', () => {
  const sourceArtist = { spotify_id: 'artist1', name: 'Test Artist', frequency: 5 };
  const albums = [makeSpotifyAlbum({ id: 'a1', name: 'Album 1' })];

  const exclusions = {
    spotifyAlbumIds: new Set<string>(),
    releaseGroupIds: new Set<string>(),
    normalizedAlbumKeys: new Set<string>(),
  };

  const result = buildFamiliarCandidatesFromAlbums(
    albums,
    sourceArtist,
    exclusions,
    10,
    new Set(),
    new Set(),
  );

  assertEquals(result[0].best_similarity_match, 1.0);
  assertEquals(result[0].source_paths[0].similar_match, 1.0);
  assertEquals(result[0].source_paths[0].source_artist.name, 'Test Artist');
});

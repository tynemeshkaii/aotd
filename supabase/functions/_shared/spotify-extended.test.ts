import { assertEquals, assertRejects } from 'https://deno.land/std/testing/asserts.ts';
import { searchAlbum } from './spotify-extended.ts';

const originalFetch = globalThis.fetch;

Deno.test('searchAlbum returns null on a successful search with no album matches', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ albums: { items: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as typeof fetch;

  try {
    const result = await searchAlbum('token', 'Niche Artist', 'Unknown Album');
    assertEquals(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('searchAlbum throws on Spotify API failures', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { status: 500 } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as typeof fetch;

  try {
    await assertRejects(
      () => searchAlbum('token', 'Artist', 'Album'),
      Error,
      'spotify_search_failed:500',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

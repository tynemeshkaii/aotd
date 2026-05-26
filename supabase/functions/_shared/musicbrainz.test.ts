import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { isAlbumLike } from './musicbrainz.ts';

Deno.test('MusicBrainz album-like check allows albums and EPs', () => {
  assertEquals(isAlbumLike({ id: 'album', primary_type: 'Album', secondary_types: [] }), true);
  assertEquals(isAlbumLike({ id: 'ep', primary_type: 'EP', secondary_types: [] }), true);
});

Deno.test('MusicBrainz album-like check allows mixtapes but rejects singles and compilations', () => {
  assertEquals(
    isAlbumLike({
      id: 'mixtape',
      primary_type: 'Album',
      secondary_types: ['Mixtape/Street'],
    }),
    true,
  );
  assertEquals(isAlbumLike({ id: 'single', primary_type: 'Single', secondary_types: [] }), false);
  assertEquals(
    isAlbumLike({
      id: 'comp',
      primary_type: 'Album',
      secondary_types: ['Compilation'],
    }),
    false,
  );
});

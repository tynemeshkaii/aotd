import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { makeCandidate } from '../../../tests/algorithm-fixtures.ts';
import { classifyCandidate } from './tier-classifier.ts';

const userArtists = new Map([
  ['aphex twin', 2],
  ['coil', 1],
]);

Deno.test('classifyCandidate treats artists with at least two library appearances as known', () => {
  const candidate = makeCandidate({
    spotify_id: 'known',
    primary_artist_name: 'Aphex Twin',
    best_similarity_match: 0.2,
    source_path_freq: 1,
  });
  assertEquals(classifyCandidate(candidate, userArtists, 'mainstream'), 'known_artist_new_album');
});

Deno.test('classifyCandidate maps mainstream unknown artists to safe anchors', () => {
  const candidate = makeCandidate({
    spotify_id: 'safe',
    primary_artist_name: 'Coldplay',
    best_similarity_match: 0.8,
    source_path_freq: 1,
  });
  assertEquals(classifyCandidate(candidate, userArtists, 'mainstream'), 'safe_anchor');
});

Deno.test('classifyCandidate only marks deep discovery when similarity is strong', () => {
  const weak = makeCandidate({
    spotify_id: 'weak',
    primary_artist_name: 'Unknown Project',
    best_similarity_match: 0.59,
    source_path_freq: 1,
  });
  const strong = makeCandidate({
    spotify_id: 'strong',
    primary_artist_name: 'Unknown Project',
    best_similarity_match: 0.6,
    source_path_freq: 1,
  });

  assertEquals(classifyCandidate(weak, userArtists, 'deep'), 'adjacent_artist');
  assertEquals(classifyCandidate(strong, userArtists, 'deep'), 'deep_discovery');
});

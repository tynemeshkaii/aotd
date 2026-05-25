import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { makeCandidate, undergroundTaste } from '../../../tests/algorithm-fixtures.ts';
import { scoreCandidates, selectFromTop } from './recommendation-algorithm.ts';
import { makeRng } from './rng.ts';

Deno.test('selectFromTop returns null on empty', () => {
  assertEquals(selectFromTop([], makeRng(42)), null);
});

Deno.test('underground profile: high-similarity candidate beats high-popularity stranger', () => {
  const candidates = [
    makeCandidate({
      spotify_id: 'narrow_match',
      primary_artist_name: 'Coil',
      best_similarity_match: 0.85,
      source_path_freq: 20,
      lastfm_listeners: 10_000,
    }),
    makeCandidate({
      spotify_id: 'mainstream_drift',
      primary_artist_name: 'Coldplay',
      best_similarity_match: 0.1,
      source_path_freq: 1,
      lastfm_listeners: 5_000_000,
    }),
  ];
  const scored = scoreCandidates(candidates, undergroundTaste, makeRng(42));
  assertEquals(scored[0].candidate.spotify_id, 'narrow_match');
});

Deno.test('release_balance: underrepresented decade gets boost', () => {
  const c1980 = makeCandidate({
    spotify_id: 'rare_decade',
    primary_artist_name: 'X',
    best_similarity_match: 0.5,
    source_path_freq: 5,
    release_year: 1985,
  });
  const c2010 = makeCandidate({
    spotify_id: 'common_decade',
    primary_artist_name: 'Y',
    best_similarity_match: 0.5,
    source_path_freq: 5,
    release_year: 2015,
  });
  const scored = scoreCandidates([c1980, c2010], undergroundTaste, () => 0.5);
  assert(scored[0].candidate.spotify_id === 'rare_decade');
});

Deno.test('deterministic scoring with seeded RNG', () => {
  const candidates = [
    makeCandidate({
      spotify_id: 'a',
      primary_artist_name: 'A',
      best_similarity_match: 0.6,
      source_path_freq: 10,
    }),
    makeCandidate({
      spotify_id: 'b',
      primary_artist_name: 'B',
      best_similarity_match: 0.6,
      source_path_freq: 10,
    }),
  ];
  const run1 = scoreCandidates(candidates, undergroundTaste, makeRng(123));
  const run2 = scoreCandidates(candidates, undergroundTaste, makeRng(123));
  assertEquals(run1[0].score, run2[0].score);
  assertEquals(run1[1].score, run2[1].score);
});

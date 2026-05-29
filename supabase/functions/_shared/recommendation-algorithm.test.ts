import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { makeCandidate, undergroundTaste } from '../../../tests/algorithm-fixtures.ts';
import { applyTrackBScore, scoreCandidates, selectFromTop } from './recommendation-algorithm.ts';
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

Deno.test('Track B penalizes mainstream candidates unless they are safe anchors', () => {
  const penalized = applyTrackBScore(1, 'known_artist_new_album', 'mainstream');
  const niche = applyTrackBScore(1, 'adjacent_artist', 'niche');

  assert(penalized.score < niche.score);
  assertEquals(penalized.multipliers.mainstream_penalty, 0.4);
});

Deno.test('Track B known-artist new album can beat unrelated mainstream drift', () => {
  const candidates = [
    makeCandidate({
      spotify_id: 'known_missing_classic',
      primary_artist_name: 'Aphex Twin',
      best_similarity_match: 0.45,
      source_path_freq: 4,
      lastfm_listeners: 90_000,
    }),
    makeCandidate({
      spotify_id: 'mainstream_drift',
      primary_artist_name: 'Coldplay',
      best_similarity_match: 0.1,
      source_path_freq: 1,
      lastfm_listeners: 5_000_000,
    }),
  ];

  const scored = scoreCandidates(candidates, undergroundTaste, () => 0.5);
  assertEquals(scored[0].candidate.spotify_id, 'known_missing_classic');
  assertEquals(scored[0].candidate_tier, 'known_artist_new_album');
});

Deno.test('Track B deep discovery bonus requires strong similarity tier', () => {
  const weak = makeCandidate({
    spotify_id: 'weak_deep',
    primary_artist_name: 'Tiny Project',
    best_similarity_match: 0.59,
    source_path_freq: 3,
    lastfm_listeners: 9_000,
  });
  const strong = makeCandidate({
    spotify_id: 'strong_deep',
    primary_artist_name: 'Tiny Project II',
    best_similarity_match: 0.6,
    source_path_freq: 3,
    lastfm_listeners: 9_000,
  });

  const scored = scoreCandidates([weak, strong], undergroundTaste, () => 0.5);
  const strongScored = scored.find((s) => s.candidate.spotify_id === 'strong_deep');
  const weakScored = scored.find((s) => s.candidate.spotify_id === 'weak_deep');

  assertEquals(strongScored?.candidate_tier, 'deep_discovery');
  assertEquals(weakScored?.candidate_tier, 'adjacent_artist');
  assert((strongScored?.score ?? 0) > (weakScored?.score ?? 0));
});

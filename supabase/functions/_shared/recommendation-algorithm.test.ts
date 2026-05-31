import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { makeCandidate, undergroundTaste } from '../../../tests/algorithm-fixtures.ts';
import {
  applyTrackBScore,
  dominantSourceArtist,
  SOURCE_REPEAT_PENALTY,
  scoreCandidates,
  selectFromTop,
} from './recommendation-algorithm.ts';
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

Deno.test('Track B penalizes mainstream adjacent_artist but not known_artist_new_album', () => {
  const knownMainstream = applyTrackBScore(1, 'known_artist_new_album', 'mainstream');
  const adjacentMainstream = applyTrackBScore(1, 'adjacent_artist', 'mainstream');
  const adjacentNiche = applyTrackBScore(1, 'adjacent_artist', 'niche');

  assertEquals(knownMainstream.multipliers.mainstream_penalty, 1);
  assertEquals(adjacentMainstream.multipliers.mainstream_penalty, 0.4);
  assert(adjacentMainstream.score < adjacentNiche.score);
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

Deno.test('pool-relative banding changes popularity buckets correctly', () => {
  const nicheUserCandidates = [
    makeCandidate({
      spotify_id: 'niche_user_mid',
      primary_artist_name: 'Mid Artist',
      best_similarity_match: 0.6,
      source_path_freq: 5,
      lastfm_listeners: 40_000,
    }),
    makeCandidate({
      spotify_id: 'global_mainstream',
      primary_artist_name: 'Big Artist',
      best_similarity_match: 0.6,
      source_path_freq: 5,
      lastfm_listeners: 2_000_000,
    }),
  ];
  // Without profile: 40k is 'niche', 2M is 'mainstream' (safe_anchor, no penalty)
  const withoutProfile = scoreCandidates(nicheUserCandidates, undergroundTaste, () => 0.5);
  const midWithout = withoutProfile.find((s) => s.candidate.spotify_id === 'niche_user_mid');
  const bigWithout = withoutProfile.find((s) => s.candidate.spotify_id === 'global_mainstream');
  assertEquals(midWithout?.popularity_bucket, 'niche');
  assertEquals(bigWithout?.popularity_bucket, 'mainstream');

  // With pool-relative profile: 40k is p25 (deep), 2M is p75 (known)
  const profile = { p25: 50_000, p50: 100_000, p75: 3_000_000 };
  const withProfile = scoreCandidates(
    nicheUserCandidates,
    undergroundTaste,
    () => 0.5,
    undefined,
    profile,
  );
  const midWith = withProfile.find((s) => s.candidate.spotify_id === 'niche_user_mid');
  const bigWith = withProfile.find((s) => s.candidate.spotify_id === 'global_mainstream');
  assertEquals(midWith?.popularity_bucket, 'deep');
  assertEquals(bigWith?.popularity_bucket, 'known');
});

Deno.test('pool-relative missing profile falls back to global thresholds', () => {
  const candidates = [
    makeCandidate({
      spotify_id: 'a',
      primary_artist_name: 'A',
      best_similarity_match: 0.6,
      source_path_freq: 5,
      lastfm_listeners: 5_000,
    }),
    makeCandidate({
      spotify_id: 'b',
      primary_artist_name: 'B',
      best_similarity_match: 0.6,
      source_path_freq: 5,
      lastfm_listeners: 500_000,
    }),
  ];
  const scored = scoreCandidates(candidates, undergroundTaste, () => 0.5, undefined, null);
  const a = scored.find((s) => s.candidate.spotify_id === 'a');
  const b = scored.find((s) => s.candidate.spotify_id === 'b');
  assertEquals(a?.popularity_bucket, 'deep');
  assertEquals(b?.popularity_bucket, 'known');
});

Deno.test('Fix 1 — dominantSourceArtist returns the highest-frequency source path', () => {
  const c = makeCandidate({
    spotify_id: 'multi',
    primary_artist_name: 'Carrier',
    best_similarity_match: 0.6,
    source_path_freq: 3,
    source_artist_name: 'Low Freq Source',
  });
  c.source_paths.push({
    source_artist: { spotify_id: null, name: 'Blawan', frequency: 10 },
    similar_match: 0.6,
  });
  assertEquals(dominantSourceArtist(c), 'Blawan');
});

Deno.test('Fix 1 — recent source artist gets penalized and loses to a fresh source', () => {
  const fromRecentSource = makeCandidate({
    spotify_id: 'from_blawan',
    primary_artist_name: 'Carrier',
    best_similarity_match: 0.9,
    source_path_freq: 10,
    source_artist_name: 'Blawan',
  });
  const fromFreshSource = makeCandidate({
    spotify_id: 'from_maara',
    primary_artist_name: 'Some Adjacent',
    best_similarity_match: 0.6,
    source_path_freq: 7,
    source_artist_name: 'Maara',
  });

  // Without the guard, the Blawan candidate (higher similarity + freq) wins.
  const baseline = scoreCandidates(
    [fromRecentSource, fromFreshSource],
    undergroundTaste,
    () => 0.5,
  );
  assertEquals(baseline[0].candidate.spotify_id, 'from_blawan');

  // With Blawan as a recent source artist, it is penalized and the fresh source wins.
  const guarded = scoreCandidates(
    [fromRecentSource, fromFreshSource],
    undergroundTaste,
    () => 0.5,
    undefined,
    undefined,
    new Set(['Blawan']),
  );
  assertEquals(guarded[0].candidate.spotify_id, 'from_maara');
  const penalized = guarded.find((s) => s.candidate.spotify_id === 'from_blawan');
  assertEquals(penalized?.track_b_multipliers?.source_repeat_penalty, SOURCE_REPEAT_PENALTY);
});

Deno.test('Fix 1 — recent-source matching is case/whitespace insensitive', () => {
  const c = makeCandidate({
    spotify_id: 'x',
    primary_artist_name: 'Y',
    best_similarity_match: 0.6,
    source_path_freq: 5,
    source_artist_name: 'Nicolas Jaar',
  });
  const scored = scoreCandidates(
    [c],
    undergroundTaste,
    () => 0.5,
    undefined,
    undefined,
    new Set(['  nicolas   jaar  ']),
  );
  assertEquals(scored[0].track_b_multipliers?.source_repeat_penalty, SOURCE_REPEAT_PENALTY);
});

Deno.test('Fix 2 — selectFromTop caps how many picks one source artist contributes', () => {
  const candidates = [
    ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) =>
      makeCandidate({
        spotify_id: id,
        primary_artist_name: `cand-${id}`,
        best_similarity_match: 0.9,
        source_path_freq: 10,
        source_artist_name: 'Blawan',
      }),
    ),
    makeCandidate({
      spotify_id: 'm1',
      primary_artist_name: 'cand-m1',
      best_similarity_match: 0.5,
      source_path_freq: 7,
      source_artist_name: 'Maara',
    }),
  ];
  const scored = scoreCandidates(candidates, undergroundTaste, () => 0.5);

  const selectedIds = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const pick = selectFromTop(scored, makeRng(seed), 20, 2);
    if (pick) selectedIds.add(pick.candidate.spotify_id);
  }
  const blawanSelected = [...selectedIds].filter((id) => id.startsWith('b'));
  assert(blawanSelected.length <= 2, `expected <=2 Blawan, got ${blawanSelected.length}`);
  assert(selectedIds.has('m1'), 'Maara candidate must be reachable in the capped pool');
});

Deno.test('Fix 2 — cap never starves the pool when all share one source artist', () => {
  const candidates = ['a', 'b', 'c'].map((id) =>
    makeCandidate({
      spotify_id: id,
      primary_artist_name: `cand-${id}`,
      best_similarity_match: 0.7,
      source_path_freq: 8,
      source_artist_name: 'OnlySource',
    }),
  );
  const scored = scoreCandidates(candidates, undergroundTaste, () => 0.5);
  const pick = selectFromTop(scored, makeRng(1), 20, 2);
  assert(pick !== null, 'must still return a pick even if every candidate shares a source');
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

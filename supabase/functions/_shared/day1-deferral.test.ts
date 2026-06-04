import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';

import { DAY1_LIBRARY_COUNT_THRESHOLD, shouldDeferFirstPick } from './day1-deferral.ts';

const NON_PERSONAL: Array<{
  reason: string;
  expectedDefer: boolean;
  expectedReason?: string;
}> = [
  { reason: 'compute_timeout', expectedDefer: true, expectedReason: 'day1_compute_timeout' },
  { reason: 'no_candidates', expectedDefer: true, expectedReason: 'day1_no_candidates' },
  {
    reason: 'spotify_search_failed',
    expectedDefer: true,
    expectedReason: 'day1_spotify_search_failed',
  },
  {
    reason: 'spotify_audio_unavailable',
    expectedDefer: true,
    expectedReason: 'day1_spotify_audio_unavailable',
  },
  { reason: 'lastfm_unavailable', expectedDefer: true, expectedReason: 'day1_lastfm_unavailable' },
  { reason: 'mb_timeout', expectedDefer: true, expectedReason: 'day1_mb_timeout' },
  {
    reason: 'library_too_small',
    expectedDefer: true,
    expectedReason: 'day1_library_quality_issue',
  },
  { reason: 'unknown_error', expectedDefer: true, expectedReason: 'day1_unknown_error' },
];

const baseInput = {
  existingPicks: 0,
  aggregatedAlbumsCount: DAY1_LIBRARY_COUNT_THRESHOLD,
};

Deno.test('shouldDeferFirstPick: new user with enough library defers for every non-personal reason', () => {
  for (const { reason, expectedDefer, expectedReason } of NON_PERSONAL) {
    const decision = shouldDeferFirstPick({ ...baseInput, fallbackReason: reason });
    assertEquals(decision.defer, expectedDefer, `reason=${reason}`);
    if (expectedDefer && expectedReason) {
      assert(decision.defer);
      assertEquals((decision as { reason: string }).reason, expectedReason);
    }
  }
});

Deno.test('shouldDeferFirstPick: established user is never deferred', () => {
  for (const { reason } of NON_PERSONAL) {
    const decision = shouldDeferFirstPick({
      fallbackReason: reason,
      existingPicks: 1,
      aggregatedAlbumsCount: 100,
    });
    assertEquals(decision.defer, false, `reason=${reason}`);
  }
});

Deno.test('shouldDeferFirstPick: established user with many picks is never deferred', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 365,
    aggregatedAlbumsCount: 1000,
  });
  assertEquals(decision.defer, false);
});

Deno.test('shouldDeferFirstPick: library_too_small with small library does NOT defer (honest fallback)', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'library_too_small',
    existingPicks: 0,
    aggregatedAlbumsCount: 5,
  });
  assertEquals(decision.defer, false);
});

Deno.test('shouldDeferFirstPick: library_too_small at threshold (10) defers as library quality issue', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'library_too_small',
    existingPicks: 0,
    aggregatedAlbumsCount: 10,
  });
  assertEquals(decision.defer, true);
  assertEquals((decision as { reason: string }).reason, 'day1_library_quality_issue');
});

Deno.test('shouldDeferFirstPick: threshold boundary — count 9 is below threshold, 10 is at threshold', () => {
  const below = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 0,
    aggregatedAlbumsCount: 9,
  });
  assertEquals(below.defer, false);

  const at = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 0,
    aggregatedAlbumsCount: 10,
  });
  assertEquals(at.defer, true);
});

Deno.test('shouldDeferFirstPick: zero library count never defers (no library means no first pick to protect)', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 0,
    aggregatedAlbumsCount: 0,
  });
  assertEquals(decision.defer, false);
});

Deno.test('shouldDeferFirstPick: null reason is defensive — does not defer', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: null,
    existingPicks: 0,
    aggregatedAlbumsCount: 100,
  });
  assertEquals(decision.defer, false);
});

Deno.test('shouldDeferFirstPick: unknown reason does not defer', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'never_heard_of_it',
    existingPicks: 0,
    aggregatedAlbumsCount: 100,
  });
  assertEquals(decision.defer, false);
});

Deno.test('shouldDeferFirstPick: custom threshold is honored', () => {
  const decision = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 0,
    aggregatedAlbumsCount: 25,
    libraryCountThreshold: 30,
  });
  assertEquals(decision.defer, false);

  const above = shouldDeferFirstPick({
    fallbackReason: 'compute_timeout',
    existingPicks: 0,
    aggregatedAlbumsCount: 30,
    libraryCountThreshold: 30,
  });
  assertEquals(above.defer, true);
});

Deno.test('shouldDeferFirstPick: every defer reason is namespaced day1_*', () => {
  for (const { reason, expectedDefer, expectedReason } of NON_PERSONAL) {
    if (!expectedDefer || !expectedReason) continue;
    assert(
      expectedReason.startsWith('day1_'),
      `expected reason for ${reason} to start with day1_, got ${expectedReason}`,
    );
  }
});

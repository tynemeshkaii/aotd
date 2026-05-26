import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { isRecommendationReleaseLike } from './release-eligibility.ts';

Deno.test('rejects one-track singles', () => {
  assertEquals(isRecommendationReleaseLike({ album_type: 'single', total_tracks: 1 }), false);
});

Deno.test('allows EP-like Spotify singles with enough tracks', () => {
  assertEquals(isRecommendationReleaseLike({ album_type: 'single', total_tracks: 4 }), true);
});

Deno.test('allows long EP-like releases when duration is known', () => {
  assertEquals(
    isRecommendationReleaseLike({
      album_type: 'single',
      total_tracks: 2,
      duration_ms: 12 * 60 * 1000,
    }),
    true,
  );
});

Deno.test('rejects compilations', () => {
  assertEquals(isRecommendationReleaseLike({ album_type: 'compilation', total_tracks: 20 }), false);
});

import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import {
  computePoolRelativeProfile,
  popularityBucket,
  popularityBucketRelative,
} from './popularity-bucket.ts';

Deno.test('popularityBucket handles null and boundaries', () => {
  assertEquals(popularityBucket(null), 'unknown');
  assertEquals(popularityBucket(undefined), 'unknown');
  assertEquals(popularityBucket(9_999), 'deep');
  assertEquals(popularityBucket(10_000), 'niche');
  assertEquals(popularityBucket(99_999), 'niche');
  assertEquals(popularityBucket(100_000), 'known');
  assertEquals(popularityBucket(999_999), 'known');
  assertEquals(popularityBucket(1_000_000), 'mainstream');
});

Deno.test('popularityBucketRelative maps against per-user profile', () => {
  const profile = { p25: 10_000, p50: 100_000, p75: 1_000_000 };
  assertEquals(popularityBucketRelative(5_000, profile), 'deep');
  assertEquals(popularityBucketRelative(10_000, profile), 'deep');
  assertEquals(popularityBucketRelative(50_000, profile), 'niche');
  assertEquals(popularityBucketRelative(100_000, profile), 'niche');
  assertEquals(popularityBucketRelative(500_000, profile), 'known');
  assertEquals(popularityBucketRelative(1_000_000, profile), 'known');
  assertEquals(popularityBucketRelative(2_000_000, profile), 'mainstream');
});

Deno.test('popularityBucketRelative falls back to global when profile is null', () => {
  assertEquals(popularityBucketRelative(5_000, null), 'deep');
  assertEquals(popularityBucketRelative(50_000, undefined), 'niche');
  assertEquals(popularityBucketRelative(null, { p25: 1, p50: 2, p75: 3 }), 'unknown');
});

Deno.test('computePoolRelativeProfile returns null when sample too small', () => {
  assertEquals(computePoolRelativeProfile([1, 2, 3, 4], 5), null);
});

Deno.test('computePoolRelativeProfile computes p25/p50/p75 correctly', () => {
  const profile = computePoolRelativeProfile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
  assertEquals(profile?.p25, 3.25);
  assertEquals(profile?.p50, 5.5);
  assertEquals(profile?.p75, 7.75);
});

Deno.test('computePoolRelativeProfile ignores null but keeps zero listeners', () => {
  const profile = computePoolRelativeProfile([null, 0, 10, 20, 30, 40, 50], 5);
  assertEquals(profile?.p25, 12.5);
  assertEquals(profile?.p50, 25);
  assertEquals(profile?.p75, 37.5);
});

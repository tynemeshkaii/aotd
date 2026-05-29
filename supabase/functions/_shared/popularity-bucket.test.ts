import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { popularityBucket } from './popularity-bucket.ts';

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

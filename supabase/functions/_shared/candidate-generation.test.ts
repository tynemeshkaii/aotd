import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';
import { capByDominantSource, dominantSourcePathName } from './candidate-generation.ts';

type Src = { spotify_id: string | null; name: string; frequency: number };
function path(name: string, frequency: number) {
  return { source_artist: { spotify_id: null, name, frequency } as Src, similar_match: 0.5 };
}

Deno.test('dominantSourcePathName picks the highest-frequency source path', () => {
  assertEquals(
    dominantSourcePathName([path('Low', 2), path('Blawan', 10), path('Mid', 7)]),
    'Blawan',
  );
  assertEquals(dominantSourcePathName([]), null);
});

Deno.test('capByDominantSource limits items per source and stays diverse', () => {
  // 5 Blawan-sourced + 2 Maara-sourced + 1 Burial-sourced, all already rank-sorted.
  const ranked = [
    { id: 'b1', source_paths: [path('Blawan', 10)] },
    { id: 'b2', source_paths: [path('Blawan', 10)] },
    { id: 'b3', source_paths: [path('Blawan', 10)] },
    { id: 'b4', source_paths: [path('Blawan', 10)] },
    { id: 'b5', source_paths: [path('Blawan', 10)] },
    { id: 'm1', source_paths: [path('Maara', 7)] },
    { id: 'm2', source_paths: [path('Maara', 7)] },
    { id: 'u1', source_paths: [path('Burial', 6)] },
  ];
  const capped = capByDominantSource(ranked, 8, 2, (c) => dominantSourcePathName(c.source_paths));
  const blawan = capped.filter((c) => c.id.startsWith('b'));
  // At most 2 Blawan in the diversity-first phase; Maara + Burial must both be present.
  assert(capped.some((c) => c.id === 'm1'));
  assert(capped.some((c) => c.id === 'u1'));
  // First 4 picked are the diverse spread (2 Blawan + 2 Maara), Burial, then backfill.
  assertEquals(
    capped.slice(0, 2).every((c) => c.id.startsWith('b')),
    true,
  );
  assert(blawan.length >= 2); // overflow backfills the rest of the budget
});

Deno.test('capByDominantSource backfills overflow to use the full topK budget', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id,
    source_paths: [path('OnlySource', 8)],
  }));
  // cap=2 per source, but topK=5 — overflow must backfill so we still resolve 5.
  const capped = capByDominantSource(ranked, 5, 2, (c) => dominantSourcePathName(c.source_paths));
  assertEquals(capped.length, 5);
});

Deno.test('capByDominantSource with maxPerKey<=0 is a plain top-K slice', () => {
  const ranked = ['a', 'b', 'c'].map((id) => ({ id, source_paths: [path('S', 1)] }));
  assertEquals(
    capByDominantSource(ranked, 2, 0, () => 'S').map((c) => c.id),
    ['a', 'b'],
  );
});

Deno.test('capByDominantSource respects topK smaller than the diverse spread', () => {
  const ranked = [
    { id: 'b1', source_paths: [path('Blawan', 10)] },
    { id: 'b2', source_paths: [path('Blawan', 10)] },
    { id: 'm1', source_paths: [path('Maara', 7)] },
  ];
  const capped = capByDominantSource(ranked, 2, 2, (c) => dominantSourcePathName(c.source_paths));
  assertEquals(capped.length, 2);
});

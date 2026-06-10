import { assertEquals, assertRejects } from 'https://deno.land/std/testing/asserts.ts';

import type { SupabaseClient } from '@supabase/supabase-js';
import { writeCandidatesToCache } from './candidate-cache.ts';
import type { AlbumCandidate } from './candidate-generation.ts';

function makeCandidate(): AlbumCandidate {
  return {
    spotify_id: 'alb1',
    title: 'Album One',
    primary_artist_name: 'Artist X',
    total_tracks: 10,
    best_similarity_match: 0.5,
    source_paths: [
      {
        source_artist: { spotify_id: null, name: 'Src A', frequency: 3 },
        similar_match: 0.5,
      },
    ],
  };
}

type StubResult = { data?: unknown; error: unknown };

/**
 * PostgREST builder stub for writeCandidatesToCache. The existing-rows lookup
 * (`select().in().in()`) is awaited directly, so the builder is thenable and
 * resolves `selectResult`. `upsert()` returns the next queued result so a test
 * can sequence "first 23505, then ok". Tracks upsert invocation count.
 */
type Builder = {
  from: () => Builder;
  select: () => Builder;
  in: () => Builder;
  then: (
    onFulfilled: (v: StubResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
  upsert: () => Promise<StubResult>;
};

function makeAdmin(opts: { selectResult: StubResult; upsertResults: StubResult[] }) {
  let upsertCalls = 0;
  const builder: Builder = {
    from() {
      return builder;
    },
    select() {
      return builder;
    },
    in() {
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable stub mimicking a PostgREST builder
    then(onFulfilled, onRejected) {
      return Promise.resolve(opts.selectResult).then(onFulfilled, onRejected);
    },
    upsert() {
      const result = opts.upsertResults[upsertCalls] ?? { error: null };
      upsertCalls += 1;
      return Promise.resolve(result);
    },
  };

  return {
    admin: builder as unknown as SupabaseClient,
    upsertCalls: () => upsertCalls,
  };
}

Deno.test('writeCandidatesToCache: success on first upsert does not retry', async () => {
  const { admin, upsertCalls } = makeAdmin({
    selectResult: { data: [], error: null },
    upsertResults: [{ error: null }],
  });
  await writeCandidatesToCache(admin, [makeCandidate()]);
  assertEquals(upsertCalls(), 1);
});

Deno.test('writeCandidatesToCache: 23505 triggers exactly one re-prepare + retry', async () => {
  const { admin, upsertCalls } = makeAdmin({
    selectResult: { data: [], error: null },
    upsertResults: [{ error: { code: '23505', message: 'duplicate key' } }, { error: null }],
  });
  await writeCandidatesToCache(admin, [makeCandidate()]);
  assertEquals(upsertCalls(), 2);
});

Deno.test('writeCandidatesToCache: non-23505 error throws without retry', async () => {
  const { admin, upsertCalls } = makeAdmin({
    selectResult: { data: [], error: null },
    upsertResults: [{ error: { code: '23503', message: 'fk violation' } }],
  });
  await assertRejects(
    () => writeCandidatesToCache(admin, [makeCandidate()]),
    Error,
    'candidate_cache_write_failed',
  );
  assertEquals(upsertCalls(), 1);
});

Deno.test('writeCandidatesToCache: 23505 on both attempts throws after the single retry', async () => {
  const { admin, upsertCalls } = makeAdmin({
    selectResult: { data: [], error: null },
    upsertResults: [
      { error: { code: '23505', message: 'duplicate key' } },
      { error: { code: '23505', message: 'duplicate key again' } },
    ],
  });
  await assertRejects(
    () => writeCandidatesToCache(admin, [makeCandidate()]),
    Error,
    'candidate_cache_write_failed',
  );
  assertEquals(upsertCalls(), 2);
});

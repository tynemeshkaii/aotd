import { assert, assertEquals, assertRejects } from 'https://deno.land/std/testing/asserts.ts';

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistRefreshedSpotifyToken, type SpotifyRefreshResult } from './spotify.ts';

// The Spotify /me product fetch inside persistRefreshedSpotifyToken is
// best-effort. Stub global fetch to reject immediately so the catch path runs
// fast and no real network call is made.
const originalFetch = globalThis.fetch;
function stubFetchRejecting() {
  globalThis.fetch = (() => Promise.reject(new Error('no_network_in_test'))) as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

const REFRESHED: SpotifyRefreshResult = {
  access_token: 'new-access',
  expires_in: 3600,
  refresh_token: 'new-refresh',
  token_type: 'Bearer',
};

type StubResult = { data: unknown; error: unknown };

/**
 * Minimal PostgREST builder stub. `from()` resets the chain. An update chain
 * ends at `.select()` (resolves updateResult). A read chain (`select().eq()…
 * .single()`) resolves readResult. Tracks the equality filters applied during
 * the update so a test can assert the CAS guard.
 */
type Builder = {
  from: () => Builder;
  update: () => Builder;
  select: () => Builder | Promise<StubResult>;
  eq: (col: string, val: unknown) => Builder;
  single: () => Promise<StubResult>;
};

function makeAdmin(opts: { updateResult: StubResult; readResult?: StubResult }) {
  const updateEqs: [string, unknown][] = [];
  let mode: 'update' | 'read' | null = null;

  const builder: Builder = {
    from() {
      mode = null;
      return builder;
    },
    update() {
      mode = 'update';
      return builder;
    },
    select() {
      if (mode === 'update') return Promise.resolve(opts.updateResult);
      mode = 'read';
      return builder;
    },
    eq(col, val) {
      if (mode === 'update') updateEqs.push([col, val]);
      return builder;
    },
    single() {
      return Promise.resolve(opts.readResult ?? { data: null, error: null });
    },
  };

  return { admin: builder as unknown as SupabaseClient, updateEqs };
}

Deno.test('persistRefreshedSpotifyToken: CAS win returns the freshly refreshed token', async () => {
  stubFetchRejecting();
  try {
    const { admin, updateEqs } = makeAdmin({
      updateResult: { data: [{ access_token: 'new-access' }], error: null },
    });
    const result = await persistRefreshedSpotifyToken(admin, 'user-1', REFRESHED, 'stale-access');
    assertEquals(result.accessToken, 'new-access');
    // The compare-and-swap guard must be present.
    assert(updateEqs.some(([c, v]) => c === 'access_token' && v === 'stale-access'));
  } finally {
    restoreFetch();
  }
});

Deno.test('persistRefreshedSpotifyToken: CAS loss adopts the concurrently-persisted token', async () => {
  stubFetchRejecting();
  try {
    const { admin } = makeAdmin({
      updateResult: { data: [], error: null }, // zero rows → lost the race
      readResult: { data: { access_token: 'winner-access', token_expires_at: 't1' }, error: null },
    });
    const result = await persistRefreshedSpotifyToken(admin, 'user-1', REFRESHED, 'stale-access');
    assertEquals(result.accessToken, 'winner-access');
    assertEquals(result.tokenExpiresAt, 't1');
  } finally {
    restoreFetch();
  }
});

Deno.test('persistRefreshedSpotifyToken: update error throws db_update_failed', async () => {
  stubFetchRejecting();
  try {
    const { admin } = makeAdmin({
      updateResult: { data: null, error: { message: 'boom' } },
    });
    await assertRejects(
      () => persistRefreshedSpotifyToken(admin, 'user-1', REFRESHED, 'stale-access'),
      Error,
      'db_update_failed',
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('persistRefreshedSpotifyToken: CAS loss with read error throws connection_not_found', async () => {
  stubFetchRejecting();
  try {
    const { admin } = makeAdmin({
      updateResult: { data: [], error: null },
      readResult: { data: null, error: { message: 'gone' } },
    });
    await assertRejects(
      () => persistRefreshedSpotifyToken(admin, 'user-1', REFRESHED, 'stale-access'),
      Error,
      'connection_not_found',
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('persistRefreshedSpotifyToken: no stale guard skips CAS and returns new token even on 0 rows', async () => {
  stubFetchRejecting();
  try {
    const { admin, updateEqs } = makeAdmin({
      updateResult: { data: [], error: null },
    });
    const result = await persistRefreshedSpotifyToken(admin, 'user-1', REFRESHED, null);
    assertEquals(result.accessToken, 'new-access');
    // Without a stale token there must be no access_token equality guard.
    assert(!updateEqs.some(([c]) => c === 'access_token'));
  } finally {
    restoreFetch();
  }
});

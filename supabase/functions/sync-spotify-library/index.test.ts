import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';

import {
  COMPUTE_URL,
  type Day1Admin,
  type Day1Deps,
  day1OnboardingCompute,
  PREWARM_URL,
} from '../_shared/day1-onboarding.ts';

type FetchCall = { url: string; method: string; body: unknown };

type ResponseSpec = {
  status: number;
  body?: unknown;
  rawText?: string;
  throws?: boolean;
};

type HarnessOptions = {
  prewarm: ResponseSpec;
  computeFirst: ResponseSpec;
  computeRetry?: ResponseSpec;
  context?: { target_date: string; user_tz: string } | { error: string };
};

const USER_ID = '00000000-0000-0000-0000-000000000001';
const SUPABASE_URL = 'https://example.supabase.co';
const CRON_SECRET = 'cron-test-secret';
const DEFAULT_CONTEXT = { target_date: '2026-06-04', user_tz: 'Asia/Bangkok' };

function buildDeps(options: HarnessOptions): {
  deps: Day1Deps;
  calls: FetchCall[];
  logs: string[];
  warns: string[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const logs: string[] = [];
  const warns: string[] = [];

  const script: ResponseSpec[] = [options.prewarm, options.computeFirst];
  if (options.computeRetry) script.push(options.computeRetry);

  const fetchFn: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const initAny = (init ?? {}) as { method?: string; body?: unknown };
    let body: unknown = null;
    if (initAny.body !== undefined) {
      try {
        body = JSON.parse(String(initAny.body));
      } catch {
        body = String(initAny.body);
      }
    }
    calls.push({ url, method: initAny.method ?? 'GET', body });

    const next = script.shift();
    if (!next) {
      return Promise.resolve(new Response('{}', { status: 500 }));
    }
    if (next.throws) {
      return Promise.reject(new Error('fetch_thrown'));
    }
    const text =
      next.rawText !== undefined
        ? next.rawText
        : next.body === undefined
          ? ''
          : JSON.stringify(next.body);
    return Promise.resolve(
      new Response(text, {
        status: next.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (msg: string) => {
    logs.push(msg);
  };
  console.warn = (msg: string) => {
    warns.push(msg);
  };
  const restore = () => {
    console.log = originalLog;
    console.warn = originalWarn;
  };

  const deps: Day1Deps = {
    fetchFn,
    cronSecret: CRON_SECRET,
    supabaseUrl: SUPABASE_URL,
    now: () => 0,
    setTimeoutFn: setTimeout,
    sleep: () => Promise.resolve(),
  };

  return { deps, calls, logs, warns, restore };
}

function buildAdmin(
  context: { target_date: string; user_tz: string } | { error: string } | undefined,
): Day1Admin {
  return {
    rpc(name: string) {
      if (name !== 'resolve_user_compute_context') {
        throw new Error(`unexpected rpc call: ${name}`);
      }
      if (!context) {
        return Promise.resolve({ data: null, error: { message: 'no_context' } });
      }
      if ('error' in context) {
        return Promise.resolve({ data: null, error: { message: context.error } });
      }
      return Promise.resolve({
        data: [{ target_date: context.target_date, user_tz: context.user_tz }],
        error: null,
      });
    },
  };
}

Deno.test('day1 wrapper: prewarm warmed + compute ok → single compute call, no retry', async () => {
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true, status: 'created', is_fallback: false } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, 'Asia/Bangkok', deps);
  restore();

  assertEquals(calls.length, 2);
  assertEquals(calls[0].url, PREWARM_URL(SUPABASE_URL));
  assertEquals(calls[1].url, COMPUTE_URL(SUPABASE_URL));
  assertEquals(calls[1].body, {
    user_id: USER_ID,
    target_date: '2026-06-04',
    user_timezone: 'Asia/Bangkok',
  });
});

Deno.test('day1 wrapper: prewarm partial + 0 candidates → still proceeds to compute', async () => {
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'partial', candidates: 0 }] } },
    computeFirst: { status: 200, body: { ok: true, status: 'created', is_fallback: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 2);
});

Deno.test('day1 wrapper: prewarm skipped (library_too_small) → still proceeds to compute', async () => {
  const { deps, calls, logs, restore } = buildDeps({
    prewarm: {
      status: 200,
      body: { results: [{ status: 'skipped', candidates: 0, reason: 'library_too_small' }] },
    },
    computeFirst: { status: 200, body: { ok: true, status: 'created', is_fallback: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 2);
  assert(
    logs.some((l) => l.includes('prewarm_done') && l.includes('status=skipped')),
    'expected prewarm_done with status=skipped',
  );
});

Deno.test('day1 wrapper: prewarm HTTP 500 → skips compute, no second call', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 500, body: { error: 'internal' } },
    computeFirst: { status: 200, body: { ok: true, status: 'created' } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, PREWARM_URL(SUPABASE_URL));
  assert(warns.some((w) => w.includes('prewarm_hard_failed') && w.includes('prewarm_http_500')));
});

Deno.test('day1 wrapper: prewarm throws → skips compute, logs hard_failed', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: {}, throws: true },
    computeFirst: { status: 200, body: { ok: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('prewarm_hard_failed')));
});

Deno.test('day1 wrapper: prewarm malformed JSON → skips compute', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, rawText: 'not-json' },
    computeFirst: { status: 200, body: { ok: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('prewarm_hard_failed')));
});

Deno.test('day1 wrapper: prewarm 200 with no status → skips compute', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{}] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('prewarm_no_status')));
});

Deno.test('day1 wrapper: prewarm 200 with results[0].status="failed" → skips compute (Phase 2 P1 regression)', async () => {
  // prewarm-user-candidates returns HTTP 200 even when an individual user's
  // prewarm fails — the per-user result is reported as `status: 'failed'`
  // inside `results[0]`. Day-1 must NOT fall through to compute in that case.
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: {
      status: 200,
      body: {
        ok: true,
        results: [
          {
            user_id: USER_ID,
            status: 'failed',
            reason: 'spotify_search_circuit_open',
            detail: 'circuit_open',
          },
        ],
      },
    },
    computeFirst: { status: 200, body: { ok: true, status: 'created' } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1, 'compute must not be called when prewarm reports failed');
  assertEquals(calls[0].url, PREWARM_URL(SUPABASE_URL));
  assert(
    warns.some(
      (w) => w.includes('prewarm_hard_failed') && w.includes('spotify_search_circuit_open'),
    ),
    'expected prewarm_hard_failed warning with the upstream reason',
  );
  assert(
    !warns.some((w) => w.includes('prewarm_done')),
    'prewarm_done must not be logged for a failed prewarm',
  );
});

Deno.test('day1 wrapper: prewarm 200 with results[0].status="failed" and no reason → still hard-fails', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: {
      status: 200,
      body: { ok: true, results: [{ user_id: USER_ID, status: 'failed' }] },
    },
    computeFirst: { status: 200, body: { ok: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('prewarm_hard_failed') && w.includes('prewarm_failed')));
});

Deno.test('day1 wrapper: prewarm 200 with unknown status → skips compute as prewarm_unexpected_status', async () => {
  // Defensive: if prewarm-user-candidates ever introduces a new status that
  // day-1 does not know about, treat it as hard_failed rather than silently
  // letting compute run with stale cache state.
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: {
      status: 200,
      body: { ok: true, results: [{ user_id: USER_ID, status: 'queued_for_tomorrow' }] },
    },
    computeFirst: { status: 200, body: { ok: true } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(
    warns.some((w) => w.includes('prewarm_hard_failed') && w.includes('prewarm_unexpected_status')),
  );
});

Deno.test('day1 wrapper: compute deferred (day1_compute_timeout) → retries once', async () => {
  const { deps, calls, warns, logs, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: {
      status: 202,
      body: { ok: false, status: 'deferred', reason: 'day1_compute_timeout' },
    },
    computeRetry: { status: 200, body: { ok: true, status: 'created', is_fallback: false } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 3);
  assert(warns.some((w) => w.includes('compute_deferred')));
  assert(logs.some((l) => l.includes('compute_retry_done')));
});

Deno.test('day1 wrapper: compute deferred (day1_no_candidates) → retries with the same body', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 30 }] } },
    computeFirst: {
      status: 202,
      body: { ok: false, status: 'deferred', reason: 'day1_no_candidates' },
    },
    computeRetry: {
      status: 202,
      body: { ok: false, status: 'deferred', reason: 'day1_no_candidates' },
    },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 3);
  assert(warns.some((w) => w.includes('compute_retry_deferred')));
});

Deno.test('day1 wrapper: compute ok first time → no retry', async () => {
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true, status: 'created', is_fallback: false } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 2);
});

Deno.test('day1 wrapper: compute 500 → no retry, logs compute_failed', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 500, body: { error: 'aotd_insert_failed' } },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 2);
  assert(warns.some((w) => w.includes('compute_failed')));
});

Deno.test('day1 wrapper: context resolve fails → no compute call', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: { error: 'rpc_failed' },
  });

  await day1OnboardingCompute(buildAdmin({ error: 'rpc_failed' }), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('context_resolve_failed')));
});

Deno.test('day1 wrapper: empty target_date → no compute call', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: { target_date: '', user_tz: 'UTC' },
  });

  await day1OnboardingCompute(
    buildAdmin({ target_date: '', user_tz: 'UTC' }),
    USER_ID,
    undefined,
    deps,
  );
  restore();

  assertEquals(calls.length, 1);
  assert(warns.some((w) => w.includes('no_profile_date')));
});

Deno.test('day1 wrapper: deviceTimezone is used as fallback user_timezone when profile is null', async () => {
  // Profile returns null for user_tz → deviceTimezone is the fallback.
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: { target_date: '2026-06-04', user_tz: 'UTC' },
  });

  // Override admin to return a null user_tz.
  const admin: Day1Admin = {
    rpc() {
      return Promise.resolve({
        data: [{ target_date: '2026-06-04', user_tz: null }],
        error: null,
      });
    },
  };

  await day1OnboardingCompute(admin, USER_ID, 'Asia/Bangkok', deps);
  restore();

  assertEquals(calls.length, 2);
  assertEquals((calls[1].body as { user_timezone: string }).user_timezone, 'Asia/Bangkok');
});

Deno.test('day1 wrapper: profile user_tz="UTC" is NOT overridden by deviceTimezone', async () => {
  // Explicit 'UTC' in profile is treated as a real value, not as "no value".
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: { target_date: '2026-06-04', user_tz: 'UTC' },
  });

  await day1OnboardingCompute(
    buildAdmin({ target_date: '2026-06-04', user_tz: 'UTC' }),
    USER_ID,
    'Asia/Bangkok',
    deps,
  );
  restore();

  assertEquals(calls.length, 2);
  assertEquals((calls[1].body as { user_timezone: string }).user_timezone, 'UTC');
});

Deno.test('day1 wrapper: deviceTimezone empty string falls back to profile timezone', async () => {
  const { deps, calls, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: { status: 200, body: { ok: true } },
    context: { target_date: '2026-06-04', user_tz: 'Asia/Tokyo' },
  });

  await day1OnboardingCompute(
    buildAdmin({ target_date: '2026-06-04', user_tz: 'Asia/Tokyo' }),
    USER_ID,
    '',
    deps,
  );
  restore();

  assertEquals(calls.length, 2);
  assertEquals((calls[1].body as { user_timezone: string }).user_timezone, 'Asia/Tokyo');
});

Deno.test('day1 wrapper: deferred retry with a non-day1_ reason is treated as unexpected', async () => {
  const { deps, calls, warns, restore } = buildDeps({
    prewarm: { status: 200, body: { results: [{ status: 'warmed', candidates: 50 }] } },
    computeFirst: {
      status: 202,
      body: { ok: false, status: 'deferred', reason: 'some_other_deferred' },
    },
    context: DEFAULT_CONTEXT,
  });

  await day1OnboardingCompute(buildAdmin(DEFAULT_CONTEXT), USER_ID, undefined, deps);
  restore();

  assertEquals(calls.length, 2);
  assert(warns.some((w) => w.includes('compute_deferred_unexpected')));
});

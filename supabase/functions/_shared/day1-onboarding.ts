import type { SupabaseClient } from '@supabase/supabase-js';

export type Day1Deps = {
  fetchFn: typeof globalThis.fetch;
  cronSecret: string;
  supabaseUrl: string;
  now: () => number;
  setTimeoutFn: typeof setTimeout;
  sleep: (ms: number) => Promise<void>;
};

export type PrewarmOutcome =
  | {
      kind: 'usable';
      candidates: number;
      status: 'warmed' | 'partial' | 'skipped';
      reason?: string;
    }
  | { kind: 'hard_failed'; reason: string };

/**
 * Status values that `prewarm-user-candidates` can return for an individual
 * user result inside `results[0]`. Anything else — including `failed` or a
 * future unknown status — must be treated as a hard failure for day-1 purposes
 * so the wrapper skips compute and lets the daily dispatcher retry later.
 *
 * The full server-side set lives in `prewarm-user-candidates/index.ts`:
 *   - `warmed`     → line 308
 *   - `partial`    → line 308
 *   - `skipped`    → lines 119 / 185 / 213 / 226 / 269
 *   - `failed`     → line 138 (per-user catch in the for-loop; overall HTTP 200)
 */
type PrewarmPerUserStatus = 'warmed' | 'partial' | 'skipped';

function isUsablePrewarmStatus(value: unknown): value is PrewarmPerUserStatus {
  return value === 'warmed' || value === 'partial' || value === 'skipped';
}

export type ComputeOutcome =
  | { kind: 'ok'; status: string | undefined; isFallback: boolean | undefined; raw: unknown }
  | { kind: 'deferred'; reason: string | undefined; raw: unknown }
  | { kind: 'failed'; status: number; body: unknown };

/**
 * Narrow structural type for the only Supabase client surface this module
 * needs: calling the `resolve_user_compute_context` RPC. The actual Supabase
 * `rpc` returns a PostgrestFilterBuilder that can be awaited, so the structural
 * shape here is intentionally permissive: any object whose `rpc` returns a
 * thenable whose `data`/`error` are accessible after `await` will work. The
 * production `SupabaseClient` satisfies this; tests can use a stub.
 */
export type Day1Admin = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type Day1SupabaseAdmin = SupabaseClient;

type AdminContextRow = {
  target_date: string | null;
  user_tz: string | null;
};

type PrewarmResultItem = {
  status?: string;
  candidates?: number;
  reason?: string;
};

type PrewarmResponseBody = {
  results?: PrewarmResultItem[];
};

export const PREWARM_URL = (supabaseUrl: string) =>
  `${supabaseUrl}/functions/v1/prewarm-user-candidates`;

export const COMPUTE_URL = (supabaseUrl: string) =>
  `${supabaseUrl}/functions/v1/compute-album-of-the-day`;

const RETRY_DELAY_MS = 15_000;

export async function runPrewarmStep(deps: Day1Deps, userId: string): Promise<PrewarmOutcome> {
  let res: Response;
  try {
    res = await deps.fetchFn(PREWARM_URL(deps.supabaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, force: true }),
    });
  } catch (e) {
    return { kind: 'hard_failed', reason: formatError(e) };
  }

  if (!res.ok) {
    return {
      kind: 'hard_failed',
      reason: `prewarm_http_${res.status}`,
    };
  }

  let body: PrewarmResponseBody;
  try {
    body = (await res.json()) as PrewarmResponseBody;
  } catch (e) {
    return { kind: 'hard_failed', reason: `prewarm_malformed_json: ${formatError(e)}` };
  }

  const item = body.results?.[0];
  if (!item || typeof item.status !== 'string') {
    return { kind: 'hard_failed', reason: 'prewarm_no_status' };
  }

  // `prewarm-user-candidates` returns HTTP 200 even when a per-user prewarm
  // fails — the failure is reported as `status: 'failed'` inside `results[0]`
  // (prewarm-user-candidates/index.ts:138). Day-1 must treat that as a hard
  // failure, otherwise we silently fall through to compute and lose the
  // Phase 2 guarantee that prewarm gates the first pick.
  if (item.status === 'failed') {
    return {
      kind: 'hard_failed',
      reason: typeof item.reason === 'string' ? item.reason : 'prewarm_failed',
    };
  }

  if (!isUsablePrewarmStatus(item.status)) {
    return {
      kind: 'hard_failed',
      reason: `prewarm_unexpected_status:${item.status}`,
    };
  }

  return {
    kind: 'usable',
    candidates: item.candidates ?? 0,
    status: item.status,
    ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
  };
}

export async function runComputeStep(
  deps: Day1Deps,
  userId: string,
  body: Record<string, unknown>,
): Promise<ComputeOutcome> {
  let res: Response;
  try {
    res = await deps.fetchFn(COMPUTE_URL(deps.supabaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, ...body }),
    });
  } catch (e) {
    return { kind: 'failed', status: 0, body: { error: formatError(e) } };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  if (res.status === 202 && parsed?.status === 'deferred') {
    return {
      kind: 'deferred',
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      raw: parsed,
    };
  }

  if (!res.ok) {
    return { kind: 'failed', status: res.status, body: parsed };
  }

  return {
    kind: 'ok',
    status: typeof parsed?.status === 'string' ? parsed.status : undefined,
    isFallback: typeof parsed?.is_fallback === 'boolean' ? parsed.is_fallback : undefined,
    raw: parsed,
  };
}

export async function day1OnboardingCompute(
  admin: Day1Admin,
  userId: string,
  deviceTimezone: unknown,
  deps: Day1Deps,
): Promise<void> {
  const log = (msg: string) => console.log(`[day1-onboard] user=${userId} ${msg}`);
  const warn = (msg: string) => console.warn(`[day1-onboard] user=${userId} ${msg}`);

  // Step 1: prewarm.
  log('prewarm_start');
  const prewarm = await runPrewarmStep(deps, userId);

  if (prewarm.kind === 'hard_failed') {
    warn(`prewarm_hard_failed reason=${prewarm.reason} skipping_compute`);
    return;
  }

  log(
    `prewarm_done status=${prewarm.status} candidates=${prewarm.candidates}${
      prewarm.reason ? ` reason=${prewarm.reason}` : ''
    }`,
  );

  // Step 2: resolve target date / timezone from profile.
  let targetDate: string;
  let userTz: string;
  try {
    const { data: ctx, error: ctxErr } = await admin.rpc('resolve_user_compute_context', {
      p_user_id: userId,
    });
    if (ctxErr) throw new Error(ctxErr.message);
    const row = (Array.isArray(ctx) ? ctx[0] : ctx) as AdminContextRow | null | undefined;
    targetDate = row?.target_date ?? '';
    userTz =
      row?.user_tz ??
      (typeof deviceTimezone === 'string' && deviceTimezone.trim().length > 0
        ? deviceTimezone
        : 'UTC');
    if (!targetDate) {
      warn('no_profile_date skipping_compute');
      return;
    }
  } catch (e) {
    warn(`context_resolve_failed ${formatError(e)}`);
    return;
  }

  const computeBody: Record<string, unknown> = {
    target_date: targetDate,
    user_timezone: userTz,
  };

  // Step 3: compute.
  log(`compute_start date=${targetDate} tz=${userTz}`);
  const first = await runComputeStep(deps, userId, computeBody);
  if (first.kind === 'deferred') {
    const reason = first.reason ?? '?';
    if (!reason.startsWith('day1_')) {
      warn(`compute_deferred_unexpected reason=${reason}`);
      return;
    }
    warn(`compute_deferred reason=${reason} retrying_after_delay`);
    await deps.sleep(RETRY_DELAY_MS);
    const retry = await runComputeStep(deps, userId, computeBody);
    if (retry.kind === 'deferred') {
      warn(`compute_retry_deferred reason=${retry.reason ?? '?'}`);
      return;
    }
    if (retry.kind === 'ok') {
      log(
        `compute_retry_done status=${retry.status ?? '?'} is_fallback=${retry.isFallback ?? '?'}`,
      );
      return;
    }
    warn(
      `compute_retry_failed status=${retry.status} body=${JSON.stringify(retry.body).slice(0, 300)}`,
    );
    return;
  }
  if (first.kind === 'ok') {
    log(`compute_done status=${first.status ?? '?'} is_fallback=${first.isFallback ?? '?'}`);
    return;
  }
  warn(`compute_failed status=${first.status} body=${JSON.stringify(first.body).slice(0, 300)}`);
}

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const DAY1_INTERNAL = {
  RETRY_DELAY_MS,
};

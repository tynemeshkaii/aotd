import type { SupabaseClient } from '@supabase/supabase-js';

export type ExternalApiService = 'spotify' | 'lastfm' | 'musicbrainz';

export type ExternalApiLogEvent = {
  service: ExternalApiService;
  endpoint: string;
  status?: number | null;
  ok: boolean;
  duration_ms?: number | null;
  retry_after_seconds?: number | null;
  error_code?: string | null;
  request_context?: string | null;
  user_id?: string | null;
};

export async function recordExternalApiCall(
  admin: SupabaseClient | null | undefined,
  event: ExternalApiLogEvent,
) {
  if (!admin) return;
  try {
    await admin.from('external_api_request_log').insert({
      service: event.service,
      endpoint: event.endpoint,
      status: event.status ?? null,
      ok: event.ok,
      duration_ms: event.duration_ms ?? null,
      retry_after_seconds: event.retry_after_seconds ?? null,
      error_code: event.error_code ? event.error_code.slice(0, 120) : null,
      request_context: event.request_context ? event.request_context.slice(0, 120) : null,
      user_id: event.user_id ?? null,
    });
  } catch (e) {
    console.warn(
      `[external-api-log] write_failed service=${event.service} endpoint=${event.endpoint} error=${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export function safeRetryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.ceil(parsed);
}

export function normalizeApiError(e: unknown): string {
  if (e instanceof Error) return e.message.split(':').slice(0, 2).join(':').slice(0, 120);
  return String(e).slice(0, 120);
}

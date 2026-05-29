import type { SupabaseClient } from '@supabase/supabase-js';

export async function reserveExternalApiSlot(
  admin: SupabaseClient,
  service: string,
  endpoint: string,
  intervalMs: number,
) {
  const { data, error } = await admin.rpc(
    'reserve_external_api_slot' as never,
    {
      p_service: service,
      p_endpoint: endpoint,
      p_interval_ms: Math.max(0, Math.floor(intervalMs)),
    } as never,
  );
  if (error) {
    console.warn(
      `[external-api-rate-limit] reserve_failed service=${service} endpoint=${endpoint} error=${error.message}`,
    );
    return;
  }

  const raw = Array.isArray(data) ? data[0] : data;
  const allowedAtMs = raw ? new Date(raw as string).getTime() : Date.now();
  const waitMs = allowedAtMs - Date.now();
  if (Number.isFinite(waitMs) && waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

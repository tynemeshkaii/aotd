import type { SupabaseClient } from '@supabase/supabase-js';

type BreakerState = {
  state: 'closed' | 'open' | 'half_open';
  cooldown_until: string | null;
  failure_count: number;
};

export class ExternalApiCircuitOpenError extends Error {
  cooldownUntil: string | null;

  constructor(message: string, cooldownUntil: string | null) {
    super(message);
    this.name = 'ExternalApiCircuitOpenError';
    this.cooldownUntil = cooldownUntil;
  }
}

export async function getExternalApiCircuitState(
  admin: SupabaseClient,
  service: string,
  endpoint: string,
): Promise<BreakerState> {
  const { data, error } = await admin.rpc(
    'get_external_api_circuit_state' as never,
    {
      p_service: service,
      p_endpoint: endpoint,
    } as never,
  );
  if (error) {
    console.warn(
      `[external-api-breaker] state_failed service=${service} endpoint=${endpoint} error=${error.message}`,
    );
    return { state: 'closed', cooldown_until: null, failure_count: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as BreakerState | null;
  return row ?? { state: 'closed', cooldown_until: null, failure_count: 0 };
}

export async function assertExternalApiCircuitAllows(
  admin: SupabaseClient,
  service: string,
  endpoint: string,
) {
  const state = await getExternalApiCircuitState(admin, service, endpoint);
  if (state.state === 'open') {
    throw new ExternalApiCircuitOpenError(
      `${service}_${endpoint}_circuit_open`,
      state.cooldown_until,
    );
  }
  return state;
}

export async function recordExternalApiCircuitSuccess(
  admin: SupabaseClient,
  service: string,
  endpoint: string,
) {
  const { error } = await admin.rpc(
    'record_external_api_circuit_success' as never,
    {
      p_service: service,
      p_endpoint: endpoint,
    } as never,
  );
  if (error) {
    console.warn(
      `[external-api-breaker] success_record_failed service=${service} endpoint=${endpoint} error=${error.message}`,
    );
  }
}

export async function recordExternalApiCircuitFailure(
  admin: SupabaseClient,
  service: string,
  endpoint: string,
  opts: { status?: number | null; error: string; cooldownSeconds: number },
) {
  const { data, error: rpcError } = await admin.rpc(
    'record_external_api_circuit_failure' as never,
    {
      p_service: service,
      p_endpoint: endpoint,
      p_status: opts.status ?? null,
      p_error: opts.error.slice(0, 500),
      p_cooldown_seconds: Math.max(0, Math.floor(opts.cooldownSeconds)),
    } as never,
  );
  if (rpcError) {
    console.warn(
      `[external-api-breaker] failure_record_failed service=${service} endpoint=${endpoint} error=${rpcError.message}`,
    );
    return null;
  }
  return (Array.isArray(data) ? data[0] : data) as BreakerState | null;
}

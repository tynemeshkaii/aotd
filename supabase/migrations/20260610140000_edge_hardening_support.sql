-- Stage 3 — database support for edge-function hardening.
--
--   5.  Prewarm rotation: track when each user's candidate cache was last
--       warmed so the cron picker rotates fairly instead of always selecting
--       the same N users (ordered by library sync recency).
--   10. Probe-lease split: a read-only peek for "is this circuit usable right
--       now" callers, so a plain check no longer consumes the single half-open
--       probe lease that get_external_api_circuit_state claims.

-- =========================================================================
-- 5. last_prewarmed_at on library_sync_status.
-- =========================================================================
alter table public.library_sync_status
  add column if not exists last_prewarmed_at timestamptz;

-- Cron prewarm orders by (last_prewarmed_at nulls first, then sync recency),
-- so never-warmed and longest-ago-warmed users are picked first.
create index if not exists library_sync_status_prewarm_rotation_idx
  on public.library_sync_status(last_prewarmed_at nulls first, updated_at);

-- =========================================================================
-- 10. peek_external_api_circuit_state — read-only, claims no probe.
-- =========================================================================
-- get_external_api_circuit_state is a state machine: it claims the single
-- half-open probe (UPDATE + 1-minute lease) on the assumption the caller is
-- about to make the probe request. Callers that only *check* whether a circuit
-- is usable (compute / prewarm live-recovery gating) must not consume that
-- lease, or they delay the real probe by a cycle. This peek reports the
-- effective state without mutating anything.

create or replace function public.peek_external_api_circuit_state(
  p_service text,
  p_endpoint text
)
returns table (
  state text,
  cooldown_until timestamptz,
  failure_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when b.state = 'open'
       and b.cooldown_until is not null
       and b.cooldown_until > now()
        then 'open'
      when b.state = 'open'
        then 'half_open'  -- cooldown elapsed; a probe is available (not claimed here)
      else b.state
    end as state,
    b.cooldown_until,
    b.failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint;
$$;

revoke all on function public.peek_external_api_circuit_state(text, text) from public, anon, authenticated;
grant execute on function public.peek_external_api_circuit_state(text, text) to service_role;

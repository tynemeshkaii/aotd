-- Distributed circuit breaker state for external APIs.

create table public.external_api_circuit_breakers (
  service text not null,
  endpoint text not null,
  state text not null check (state in ('closed', 'open', 'half_open')),
  opened_at timestamptz,
  cooldown_until timestamptz,
  last_status integer,
  last_error text,
  failure_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (service, endpoint)
);

alter table public.external_api_circuit_breakers enable row level security;
revoke all on public.external_api_circuit_breakers from anon, authenticated;

create or replace function public.get_external_api_circuit_state(
  p_service text,
  p_endpoint text
)
returns table (
  state text,
  cooldown_until timestamptz,
  failure_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_probe_claimed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_service || ':' || p_endpoint || ':breaker'));

  insert into public.external_api_circuit_breakers(service, endpoint, state)
  values (p_service, p_endpoint, 'closed')
  on conflict (service, endpoint) do nothing;

  -- Claim exactly one half-open probe after cooldown. While that probe is in
  -- flight, other workers see the circuit as open until the probe succeeds,
  -- fails, or the short probe lease expires.
  update public.external_api_circuit_breakers
  set
    state = 'half_open',
    cooldown_until = now() + interval '1 minute',
    updated_at = now()
  where service = p_service
    and endpoint = p_endpoint
    and (
      (state = 'open' and cooldown_until is not null and cooldown_until <= now())
      or (state = 'half_open' and cooldown_until is not null and cooldown_until <= now())
    );
  get diagnostics v_probe_claimed_count = row_count;

  return query
  select
    case
      when b.state = 'half_open' and v_probe_claimed_count = 0 then 'open'
      else b.state
    end as state,
    b.cooldown_until,
    b.failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint;
end;
$$;

create or replace function public.record_external_api_circuit_success(
  p_service text,
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_service || ':' || p_endpoint || ':breaker'));

  insert into public.external_api_circuit_breakers(
    service,
    endpoint,
    state,
    opened_at,
    cooldown_until,
    last_status,
    last_error,
    failure_count,
    updated_at
  )
  values (p_service, p_endpoint, 'closed', null, null, null, null, 0, now())
  on conflict (service, endpoint) do update
  set
    state = 'closed',
    opened_at = null,
    cooldown_until = null,
    last_status = null,
    last_error = null,
    failure_count = 0,
    updated_at = now();
end;
$$;

create or replace function public.record_external_api_circuit_failure(
  p_service text,
  p_endpoint text,
  p_status integer,
  p_error text,
  p_cooldown_seconds integer
)
returns table (
  state text,
  cooldown_until timestamptz,
  failure_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failure_count integer;
  v_cooldown_seconds integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_service || ':' || p_endpoint || ':breaker'));

  insert into public.external_api_circuit_breakers(service, endpoint, state, failure_count)
  values (p_service, p_endpoint, 'closed', 0)
  on conflict (service, endpoint) do nothing;

  select b.failure_count + 1 into v_failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint
  for update;

  v_cooldown_seconds := greatest(coalesce(p_cooldown_seconds, 0), 0);

  update public.external_api_circuit_breakers b
  set
    state = case when v_cooldown_seconds > 0 then 'open' else 'closed' end,
    opened_at = case when v_cooldown_seconds > 0 then now() else null end,
    cooldown_until = case
      when v_cooldown_seconds > 0 then now() + make_interval(secs => v_cooldown_seconds)
      else null
    end,
    last_status = p_status,
    last_error = left(p_error, 500),
    failure_count = v_failure_count,
    updated_at = now()
  where b.service = p_service and b.endpoint = p_endpoint;

  return query
  select b.state, b.cooldown_until, b.failure_count
  from public.external_api_circuit_breakers b
  where b.service = p_service and b.endpoint = p_endpoint;
end;
$$;

revoke execute on function public.get_external_api_circuit_state(text, text) from public;
revoke execute on function public.record_external_api_circuit_success(text, text) from public;
revoke execute on function public.record_external_api_circuit_failure(text, text, integer, text, integer)
  from public;

grant execute on function public.get_external_api_circuit_state(text, text) to service_role;
grant execute on function public.record_external_api_circuit_success(text, text) to service_role;
grant execute on function public.record_external_api_circuit_failure(text, text, integer, text, integer)
  to service_role;

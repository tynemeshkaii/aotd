-- DB-backed distributed limiter for external API calls across Edge instances.

create table public.external_api_rate_limits (
  service text not null,
  endpoint text not null,
  next_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service, endpoint)
);

alter table public.external_api_rate_limits enable row level security;
revoke all on public.external_api_rate_limits from anon, authenticated;

create or replace function public.reserve_external_api_slot(
  p_service text,
  p_endpoint text,
  p_interval_ms integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_next timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_service || ':' || p_endpoint || ':rate'));

  insert into public.external_api_rate_limits(service, endpoint, next_allowed_at)
  values (p_service, p_endpoint, v_now)
  on conflict (service, endpoint) do nothing;

  select next_allowed_at into v_next
  from public.external_api_rate_limits
  where service = p_service and endpoint = p_endpoint
  for update;

  update public.external_api_rate_limits
  set
    next_allowed_at = greatest(v_now, v_next)
      + ((greatest(p_interval_ms, 0)::text || ' milliseconds')::interval),
    updated_at = v_now
  where service = p_service and endpoint = p_endpoint;

  return greatest(v_now, v_next);
end;
$$;

revoke execute on function public.reserve_external_api_slot(text, text, integer) from public;
grant execute on function public.reserve_external_api_slot(text, text, integer) to service_role;

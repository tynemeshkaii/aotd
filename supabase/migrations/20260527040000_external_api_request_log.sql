-- External API observability for recommendation/prewarm pipelines.

create table public.external_api_request_log (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('spotify', 'lastfm', 'musicbrainz')),
  endpoint text not null,
  status integer,
  ok boolean not null,
  duration_ms integer,
  retry_after_seconds integer,
  error_code text,
  request_context text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index external_api_request_log_recent_idx
  on public.external_api_request_log(service, endpoint, created_at desc);

create index external_api_request_log_user_recent_idx
  on public.external_api_request_log(user_id, created_at desc)
  where user_id is not null;

alter table public.external_api_request_log enable row level security;
revoke all on public.external_api_request_log from anon, authenticated;

create or replace view public.v1_external_api_health
with (security_invoker = true) as
select
  date_trunc('hour', created_at) as hour,
  service,
  endpoint,
  count(*) as calls,
  count(*) filter (where not ok) as failures,
  count(*) filter (where status = 429) as rate_limited,
  round(avg(duration_ms)) as avg_duration_ms
from public.external_api_request_log
where created_at > now() - interval '7 days'
group by 1, 2, 3
order by 1 desc, 2, 3;

create or replace function public.prune_external_api_request_log()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.external_api_request_log
  where created_at < now() - interval '30 days';
$$;

revoke execute on function public.prune_external_api_request_log() from public;
grant execute on function public.prune_external_api_request_log() to service_role;

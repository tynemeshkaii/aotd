-- Tighten discovery observability view grants after creation/default privileges.
-- The view is operational telemetry only; clients should not read it, and
-- service_role only needs SELECT for analysis.

revoke all on public.v_discovery_pick_observability from public, anon, authenticated, service_role;
grant select on public.v_discovery_pick_observability to service_role;

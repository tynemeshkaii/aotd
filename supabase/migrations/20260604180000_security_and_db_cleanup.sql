-- Phase 1: Security and DB access cleanup
-- - Lock down operational telemetry views to service_role only
-- - Add timezone validation write guard so invalid strings cannot reach profiles.timezone

-- =========================================================================
-- 1. Operational views: revoke from public/authenticated, grant service_role only
-- =========================================================================

-- v1_fallback_health was explicitly granted to authenticated in an earlier migration.
revoke all on public.v1_fallback_health from public, anon, authenticated;
grant select on public.v1_fallback_health to service_role;

-- v1_external_api_health inherited default PUBLIC access because no explicit
-- revoke/grant was issued when it was created. Close it now.
revoke all on public.v1_external_api_health from public, anon, authenticated;
grant select on public.v1_external_api_health to service_role;

-- =========================================================================
-- 2. Timezone validation write guard
-- =========================================================================

create or replace function public.set_profile_timezone_if_valid(
  p_user_id uuid,
  p_timezone text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_tz    text := nullif(trim(p_timezone), '');
  validated text;
begin
  if raw_tz is null then
    return null;
  end if;

  validated := public.safe_profile_timezone(p_timezone);

  -- If safe_profile_timezone fell back to UTC but the input was not exactly UTC,
  -- the input is invalid; skip the write and return null.
  if validated = 'UTC' and raw_tz <> 'UTC' then
    return null;
  end if;

  update public.profiles
  set timezone = validated
  where id = p_user_id;

  return validated;
end;
$$;

-- Service-only: the client never calls this RPC directly. `sync-spotify-library`
-- invokes it through the service-role client after validating the user's JWT.
revoke all on function public.set_profile_timezone_if_valid(uuid, text) from public, anon, authenticated;
grant execute on function public.set_profile_timezone_if_valid(uuid, text) to service_role;

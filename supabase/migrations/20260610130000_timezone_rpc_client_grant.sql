-- Stage 2 — route client timezone writes through the validating RPC.
--
-- `set_profile_timezone_if_valid` becomes callable by authenticated clients so
-- the app can stop issuing a raw `update profiles set timezone`. Because the
-- function is SECURITY DEFINER, granting it to authenticated would otherwise
-- let any caller write ANY user's timezone (p_user_id is a free argument), so
-- this adds an explicit ownership guard:
--   - an authenticated caller may only target their own row (auth.uid()), and
--   - the service role (sync-spotify-library, where auth.uid() is null) is
--     allowed through unchanged.

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
  is_service boolean :=
    coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  -- Ownership guard: authenticated callers are scoped to their own row; the
  -- service role bypasses (it sets timezone during onboarding sync where there
  -- is no auth.uid()).
  if not is_service and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

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

revoke all on function public.set_profile_timezone_if_valid(uuid, text) from public, anon, authenticated;
grant execute on function public.set_profile_timezone_if_valid(uuid, text) to authenticated, service_role;

-- The client no longer writes profiles.timezone directly. Drop the timezone
-- column from the authenticated UPDATE grant so the validating RPC is the only
-- client write path. (display_name / avatar_url / preferred_push_time /
-- onboarding_completed stay client-writable.)
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, preferred_push_time, onboarding_completed)
  on public.profiles to authenticated;

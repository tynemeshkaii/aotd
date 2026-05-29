-- Remove direct EXECUTE grants from anon/authenticated.
-- Previous lockdown revoked PUBLIC, but live functions also had explicit
-- anon/authenticated grants in proacl.

revoke execute on function public.discovery_album_rows(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_recommendation_atomic(uuid, uuid, date, integer, jsonb, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.find_users_due_for_compute(integer, integer) from public, anon, authenticated;
revoke execute on function public.resolve_user_compute_context(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_external_api_slot(text, text, integer) from public, anon, authenticated;
revoke execute on function public.get_external_api_circuit_state(text, text) from public, anon, authenticated;
revoke execute on function public.record_external_api_circuit_success(text, text) from public, anon, authenticated;
revoke execute on function public.record_external_api_circuit_failure(text, text, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.prune_external_api_request_log() from public, anon, authenticated;
revoke execute on function public.try_start_library_sync(uuid, timestamptz, interval) from public, anon, authenticated;

revoke execute on function public.get_current_pick(uuid) from public, anon, authenticated;
revoke execute on function public.get_discoveries(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_discovery_detail(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.save_album_rating(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.safe_profile_timezone(text) from public, anon, authenticated;

grant execute on function public.discovery_album_rows(uuid) to service_role;
grant execute on function public.ensure_recommendation_atomic(uuid, uuid, date, integer, jsonb, boolean, text, text) to service_role;
grant execute on function public.find_users_due_for_compute(integer, integer) to service_role;
grant execute on function public.resolve_user_compute_context(uuid) to service_role;
grant execute on function public.reserve_external_api_slot(text, text, integer) to service_role;
grant execute on function public.get_external_api_circuit_state(text, text) to service_role;
grant execute on function public.record_external_api_circuit_success(text, text) to service_role;
grant execute on function public.record_external_api_circuit_failure(text, text, integer, text, integer) to service_role;
grant execute on function public.prune_external_api_request_log() to service_role;
grant execute on function public.try_start_library_sync(uuid, timestamptz, interval) to service_role;

grant execute on function public.get_current_pick(uuid) to authenticated;
grant execute on function public.get_discoveries(uuid, integer, integer) to authenticated;
grant execute on function public.get_discovery_detail(uuid, uuid) to authenticated;
grant execute on function public.save_album_rating(uuid, uuid, integer, text) to authenticated;
grant execute on function public.safe_profile_timezone(text) to authenticated, service_role;

-- Also tighten profiles table grants found during live audit.
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
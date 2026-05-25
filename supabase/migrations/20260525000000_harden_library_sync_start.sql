-- Phase 3 hardening: atomically decide whether a Spotify library sync should start.
-- The Edge Function calls this before EdgeRuntime.waitUntil(...). It prevents
-- accidental parallel syncs for the same user while allowing stale runs to be
-- replaced after the client-visible timeout window.

create or replace function public.try_start_library_sync(
  p_user_id uuid,
  p_started_at timestamptz,
  p_stale_after interval default interval '10 minutes'
)
returns table (
  should_start boolean,
  status text,
  started_at timestamptz,
  updated_at timestamptz,
  aggregated_albums_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.library_sync_status%rowtype;
  lock_key bigint;
begin
  lock_key := hashtextextended('library_sync:' || p_user_id::text, 0);

  if not pg_try_advisory_xact_lock(lock_key) then
    select *
      into existing
      from public.library_sync_status
      where user_id = p_user_id;

    return query
      select
        false,
        coalesce(existing.status, 'queued'),
        existing.started_at,
        existing.updated_at,
        existing.aggregated_albums_count;
    return;
  end if;

  select *
    into existing
    from public.library_sync_status
    where user_id = p_user_id
    for update;

  if found
    and existing.status in ('queued', 'syncing')
    and existing.updated_at > p_started_at - p_stale_after
  then
    return query
      select
        false,
        existing.status,
        existing.started_at,
        existing.updated_at,
        existing.aggregated_albums_count;
    return;
  end if;

  insert into public.library_sync_status (
    user_id,
    provider,
    status,
    started_at,
    completed_at,
    total_estimate,
    processed_count,
    saved_albums_count,
    saved_tracks_count,
    error_code,
    error_message
  )
  values (
    p_user_id,
    'spotify',
    'queued',
    p_started_at,
    null,
    null,
    0,
    null,
    null,
    null,
    null
  )
  on conflict (user_id) do update
    set
      provider = excluded.provider,
      status = excluded.status,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      total_estimate = excluded.total_estimate,
      processed_count = excluded.processed_count,
      saved_albums_count = excluded.saved_albums_count,
      saved_tracks_count = excluded.saved_tracks_count,
      error_code = excluded.error_code,
      error_message = excluded.error_message;
  -- Intentionally preserve aggregated_albums_count during repeat syncs so an
  -- already-onboarded user is not forced back into the first-sync splash.

  select *
    into existing
    from public.library_sync_status
    where user_id = p_user_id;

  return query
    select
      true,
      existing.status,
      existing.started_at,
      existing.updated_at,
      existing.aggregated_albums_count;
end;
$$;

revoke all on function public.try_start_library_sync(uuid, timestamptz, interval) from public;
grant execute on function public.try_start_library_sync(uuid, timestamptz, interval) to service_role;

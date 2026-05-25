-- Phase 4 fixes: race-safe recommendation insert and stricter client status updates.

create or replace function public.ensure_recommendation_atomic(
  p_user_id uuid,
  p_album_id uuid,
  p_date date,
  p_algorithm_version integer,
  p_selection_reason jsonb,
  p_is_fallback boolean,
  p_fallback_reason text,
  p_user_timezone text
)
returns table (created boolean, aotd_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  insert into public.albums_of_the_day (
    user_id, date, album_id, algorithm_version, selection_reason,
    is_fallback, fallback_reason, user_timezone_at_compute
  ) values (
    p_user_id, p_date, p_album_id, p_algorithm_version, p_selection_reason,
    p_is_fallback, p_fallback_reason, p_user_timezone
  )
  on conflict (user_id, date) do nothing
  returning id into new_id;

  if new_id is null then
    select id into existing_id from public.albums_of_the_day
      where user_id = p_user_id and date = p_date;

    return query select false, existing_id;
    return;
  end if;

  insert into public.recommendation_history (user_id, album_id)
    values (p_user_id, p_album_id)
    on conflict (user_id, album_id) do nothing;

  return query select true, new_id;
end;
$$;

create or replace function public.aotd_guard_client_update()
returns trigger language plpgsql as $$
begin
  if old.user_id is distinct from new.user_id
     or old.album_id is distinct from new.album_id
     or old.date is distinct from new.date
     or old.algorithm_version is distinct from new.algorithm_version
     or old.selection_reason is distinct from new.selection_reason
     or old.is_fallback is distinct from new.is_fallback
     or old.fallback_reason is distinct from new.fallback_reason
     or old.user_timezone_at_compute is distinct from new.user_timezone_at_compute
     or old.created_at is distinct from new.created_at
  then
    raise exception 'aotd_immutable_field';
  end if;

  if old.status = 'pending' and new.status not in ('pending', 'opened') then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if old.status = 'opened' and new.status not in ('opened', 'rated') then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if old.status = 'rated' and new.status <> 'rated' then
    raise exception 'aotd_invalid_status_transition';
  end if;

  if new.status = 'pending' and old.opened_at is distinct from new.opened_at then
    raise exception 'aotd_opened_at_without_opened_status';
  end if;

  if new.status in ('opened', 'rated') and old.opened_at is null then
    new.opened_at = now();
  end if;

  if new.status in ('opened', 'rated')
     and old.opened_at is not null
     and old.opened_at is distinct from new.opened_at
  then
    raise exception 'aotd_opened_at_immutable';
  end if;

  return new;
end;
$$;

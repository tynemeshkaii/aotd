-- Shadow mode: stores the alternative pick the new logic would serve,
-- with full breakdown, while the live pick remains unchanged.

create table public.aotd_shadow_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  date date not null,
  live_album_id uuid references public.albums(id),
  shadow_album_id uuid references public.albums(id),
  shadow_selection_reason jsonb,
  shadow_algorithm_version int,
  same_as_live boolean,
  created_at timestamptz default now(),
  unique (user_id, date)
);

alter table public.aotd_shadow_picks enable row level security;
revoke all on public.aotd_shadow_picks from anon, authenticated;

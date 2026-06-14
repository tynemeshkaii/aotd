# Monthly Recap — backend + screen (sub-plan of B4)

> Sub-plan of `plans/2026-06-14-editorial-design-overhaul.md` §4 B4. Deepens the data layer for "The Monthly Review" recap surface. Execute with `superpowers:executing-plans`.

**Status:** Approved direction, not started. Authored 2026-06-14.

---

## Decision: new RPC, not an extension of `get_profile_overview`

`get_profile_overview(p_user_id)` is "now"-scoped (streak to today, all-time taste, this-month ratings). Recap is **arbitrary-month**-scoped and read on demand from a different screen. Extending the hot overview RPC with a month parameter would bloat the Profile's first-paint query. **Add two new authenticated RPCs.** Mirror the overview's security/grant conventions exactly (it is the live template: `security definer`, `set search_path = public`, ownership guard `p_user_id <> auth.uid()`, `safe_profile_timezone` for the zone, `revoke all from public, anon, authenticated` then `grant execute to authenticated`).

## Timezone correctness by construction

Do **not** bucket on `ratings.updated_at` (that needs a local-zone conversion and is error-prone — see the `rated_this_month` fix history in `AGENTS.md`). Bucket on the pick's **`albums_of_the_day.date`**, which is already the user's local calendar date. A month's issues = picks whose `date` falls in `[month_start, month_start + 1 month)`. The rating score is read off the pick via a join. This sidesteps timezone bucketing entirely.

---

## Migration: `supabase/migrations/20260614<HHMMSS>_monthly_recap_rpcs.sql`

(Use the next available `YYYYMMDDHHMMSS` after `20260610140000`. Two functions.)

### `get_recap_months(p_user_id uuid) returns jsonb`

Lists months that have at least one pick, newest first, so the recap entry can offer month navigation without guessing.

```sql
create or replace function public.get_recap_months(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'issues', c) order by m desc)
    from (
      select date_trunc('month', date)::date as m, count(*) as c
      from public.albums_of_the_day
      where user_id = p_user_id
      group by 1
    ) g
  ), '[]'::jsonb);
end;
$$;
```

### `get_monthly_recap(p_user_id uuid, p_month date) returns jsonb`

`p_month` is any date inside the target month (client passes the 1st). Returns counts, rating spread, top finding, avg, and library span.

```sql
create or replace function public.get_monthly_recap(p_user_id uuid, p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_top   jsonb;
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- One pass over this month's picks joined to their (optional) rating.
  with picks as (
    select a.aotd_id, a.issue_number, a.date, a.status, a.album_id,
           r.score::int as score
    from public.albums_of_the_day a
    left join public.ratings r
      on r.user_id = a.user_id and r.album_id = a.album_id
    where a.user_id = p_user_id
      and a.date >= v_start and a.date < v_end
  )
  -- Top finding = highest-scored rated pick this month, newest as tie-break.
  select to_jsonb(t) into v_top
  from (
    select p.aotd_id, p.issue_number, al.title as album_title,
           al.primary_artist_name as album_primary_artist_name,
           al.cover_url as album_cover_url, p.score as rating_score
    from picks p
    join public.albums al on al.id = p.album_id
    where p.score is not null
    order by p.score desc, p.date desc
    limit 1
  ) t;

  return jsonb_build_object(
    'month', v_start,
    'issues_count', (select count(*) from picks),
    'opened_count', (select count(*) from picks where status in ('opened','rated')),
    'rated_count', (select count(*) from picks where score is not null),
    'rating_spread', jsonb_build_object(
      '5', (select count(*) from picks where score = 5),
      '4', (select count(*) from picks where score = 4),
      '3', (select count(*) from picks where score = 3),
      '2', (select count(*) from picks where score = 2),
      '1', (select count(*) from picks where score = 1)
    ),
    'avg_score', (select round(avg(score)::numeric, 1) from picks where score is not null),
    'top_finding', v_top,  -- null when nothing rated this month
    'span_min', (select min(release_year) from public.user_library
                 where user_id = p_user_id and removed_at is null
                   and release_year between 1900 and 2100),
    'span_max', (select max(release_year) from public.user_library
                 where user_id = p_user_id and removed_at is null
                   and release_year between 1900 and 2100)
  );
end;
$$;
```

**Verify column names before applying** against the real schema: confirm `albums` has `title`, `primary_artist_name`, `cover_url`, `id`; confirm `albums_of_the_day` has `aotd_id`, `issue_number`, `date`, `status`, `album_id`, `user_id`; confirm `ratings` has `score`, `album_id`, `user_id`. Mirror the exact join/columns used by `get_discoveries` / `get_current_pick` (read those RPC migrations first). Adjust the SQL to match — the shape above is the contract, the column names must match live.

### Grants (both functions)

```sql
revoke all on function public.get_recap_months(uuid) from public, anon, authenticated;
grant execute on function public.get_recap_months(uuid) to authenticated;
revoke all on function public.get_monthly_recap(uuid, date) from public, anon, authenticated;
grant execute on function public.get_monthly_recap(uuid, date) to authenticated;
```

Client RPCs → `authenticated` only, never `anon`/`service_role` (per `AGENTS.md` grant rules).

---

## Client

- [ ] `lib/hooks/useRecapMonths.ts` — key `['recap-months', userId]`, `supabase.rpc('get_recap_months', { p_user_id: userId })`. Cast through `never` until `npm run db:types` regenerates types, then assert shape (per `AGENTS.md` RPC convention). Call `supabase.rpc(...)` inline (never detach).
- [ ] `lib/hooks/useMonthlyRecap.ts` — key `['monthly-recap', userId, month]`, `supabase.rpc('get_monthly_recap', { p_user_id: userId, p_month: month })`. Same casting rule. Define a `MonthlyRecap` TS type matching the jsonb shape above; `top_finding` is `Pick<AlbumDiscovery, 'aotd_id' | 'issue_number' | 'album_title' | 'album_primary_artist_name' | 'album_cover_url' | 'rating_score'> | null`.
- [ ] `components/skins/shared/RecapController.tsx` — owns month selection, both queries, navigation to discovery detail (by `top_finding.aotd_id`), loading/empty/error.
- [ ] `components/skins/editorial/views/RecapView.tsx` — presentation per the mockup: `THE MONTHLY REVIEW` masthead + month, two stat cells (`issues_count` / `rated_count`), `RATING SPREAD` 5-bar chart (static ink, single coral peak; bars from `rating_spread`), `TOP FINDING` row (cover + title + `EditorialStamp` score, taps to detail), `EDITOR'S NOTE` — a short sentence built **from the spread using the five emotional labels** (e.g. "Mostly Loved it this month" from the modal bucket), never a numeric-average headline (invariant: emotional labels, avoid numeric emphasis). `avg_score` may inform copy but is not the headline.
- [ ] Route `app/discoveries/recap/[month].tsx` (thin) → `RecapController`. Respect the root `Stack` navigation contract and `goBackToDiscoveries`-style back behavior.
- [ ] Entry points: a "This month in review" card in Profile (uses `get_recap_months` to show the latest month) and/or an affordance on archive month headers. Honest states: no zero-metric placeholders before data loads; distinct empty (month with 0 picks), partial (picks but 0 rated → spread all zero, `top_finding` null → show a "nothing rated yet" note), and full.

---

## Validation

- [ ] SQL sanity in a Supabase branch (or `execute_sql` via MCP) before app wiring: a month with mixed rated/unrated picks returns correct counts, spread sums to `rated_count`, `top_finding` is the max score, current (partial) month works, a no-pick month returns zeros + null top finding.
- [ ] `rtk tsc && rtk lint` after client wiring.
- [ ] Device: empty month, single-pick month, full month; tap top finding → discovery detail; back returns to recap.

## Manual steps (surface to user — sandbox blocks these)

- `supabase db push` → then `npm run db:types` (order matters: types reflect applied DB).
- Re-check the `never`-cast RPC calls compile against regenerated types; tighten casts.
- No Edge Function deploy needed (RPC-only).

## AGENTS.md updates (same PR)

- Add `get_recap_months` and `get_monthly_recap` to "Current client RPCs and shapes" with their jsonb shapes and `authenticated`-only grants.
- Note the recap route and `lib/hooks/useMonthlyRecap` / `useRecapMonths`.
- Note that recap buckets by the pick's local `date`, not `ratings.updated_at`.

## Open questions

- Confirm `albums` / `albums_of_the_day` / `ratings` exact column names against the live read RPCs before applying (the SQL above is the contract; names must match).
- Decide the Profile entry affordance (card vs month-header link) during implementation — either is fine; card is recommended for discoverability.

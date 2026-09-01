-- NEXT_100 #40. Peer-city benchmark.
-- Returns ONE row for the given city: its resolution rate + MTTR, its rank
-- among active cities that have reports, and the peer medians. Strictly
-- anonymized aggregates. No other city is named or identifiable.
-- SECURITY DEFINER (pinned search_path) so a single-city staff/anon caller can
-- see the cross-city comparison without RLS exposing other cities' rows.
create or replace function public.analytics_peer_benchmark(_city_id uuid)
returns table (
  resolution_rate numeric,
  mttr_hours numeric,
  rank integer,
  total_cities integer,
  percentile integer,
  peer_median_resolution numeric,
  peer_median_mttr numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with per_city as (
    select
      r.city_id,
      count(*) as total,
      count(*) filter (where r.status = 'closed') as closed,
      round(
        count(*) filter (where r.status = 'closed')::numeric
          / nullif(count(*), 0) * 100, 1
      ) as resolution_rate,
      round(
        avg(
          extract(epoch from (wo.completed_at - r.created_at)) / 3600.0
        ) filter (where wo.completed_at is not null), 1
      ) as mttr_hours
    from reports r
    join cities c on c.id = r.city_id and c.active
    left join work_orders wo on wo.report_id = r.id
    group by r.city_id
    having count(*) > 0
  ),
  ranked as (
    select
      city_id, resolution_rate, mttr_hours,
      rank() over (order by resolution_rate desc nulls last)::int as rnk,
      count(*) over () as n
    from per_city
  )
  select
    me.resolution_rate,
    me.mttr_hours,
    me.rnk as rank,
    me.n as total_cities,
    case when me.n > 1
      then round((1 - (me.rnk - 1)::numeric / (me.n - 1)) * 100)::int
      else 100 end as percentile,
    (select round(percentile_cont(0.5) within group (order by resolution_rate))
       from per_city where city_id <> _city_id) as peer_median_resolution,
    (select round(percentile_cont(0.5) within group (order by mttr_hours))
       from per_city where city_id <> _city_id and mttr_hours is not null) as peer_median_mttr
  from ranked me
  where me.city_id = _city_id;
$$;

grant execute on function public.analytics_peer_benchmark(uuid) to anon, authenticated;

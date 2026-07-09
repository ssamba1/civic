-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_059_wo_routing_and_config.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

create table if not exists public.routing_config (
  city_id uuid not null,
  weights jsonb,
  soft_cap integer default 10 not null,
  max_contractor_spend_daily numeric,
  travel_multiplier numeric default 1 not null,
  traffic_curve jsonb,
  shift_windows jsonb,
  updated_at timestamp with time zone default now() not null,
  constraint routing_config_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  constraint routing_config_max_contractor_spend_daily_check CHECK (((max_contractor_spend_daily IS NULL) OR (max_contractor_spend_daily >= (0)::numeric))),
  constraint routing_config_pkey PRIMARY KEY (city_id),
  constraint routing_config_soft_cap_check CHECK ((soft_cap > 0)),
  constraint routing_config_travel_multiplier_check CHECK ((travel_multiplier > (0)::numeric))
);

alter table public.routing_config enable row level security;

create policy "routing_config_select_staff" on public.routing_config for select to public
  using ((is_staff() AND (city_id = current_user_city_id())));

create policy "routing_config_write_admin" on public.routing_config for all to public
  using ((is_admin() AND (city_id = current_user_city_id())))
  with check ((is_admin() AND (city_id = current_user_city_id())));

-- work_orders routing fields (same recovered batch)
alter table public.work_orders
  add column if not exists route_sequence integer,
  add column if not exists plan_generation integer default 0 not null,
  add column if not exists assigned_at timestamp with time zone,
  add column if not exists assignment_locked boolean default false not null,
  add column if not exists en_route boolean default false not null,
  add column if not exists public_eta timestamp with time zone,
  add column if not exists low_geo_confidence boolean default false not null,
  add column if not exists materials_ready boolean default true not null,
  add column if not exists depends_on uuid,
  add column if not exists cluster_id uuid,
  add column if not exists actual_minutes integer,
  add column if not exists actual_travel_secs integer;

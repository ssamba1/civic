-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_061_effort_priors.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

create table if not exists public.effort_priors (
  city_id uuid not null,
  category text not null,
  crew_type text default ''::text not null,
  median_minutes integer not null,
  n integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint effort_priors_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  constraint effort_priors_median_minutes_check CHECK ((median_minutes > 0)),
  constraint effort_priors_n_check CHECK ((n >= 0)),
  constraint effort_priors_pkey PRIMARY KEY (city_id, category, crew_type)
);

alter table public.effort_priors enable row level security;

CREATE INDEX idx_effort_priors_lookup ON public.effort_priors USING btree (city_id, category, crew_type);

create policy "effort_priors_select_staff" on public.effort_priors for select to public
  using ((is_staff() AND (city_id = current_user_city_id())));

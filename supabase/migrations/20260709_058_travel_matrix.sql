-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_058_travel_matrix.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

create table if not exists public.travel_matrix (
  city_id uuid not null,
  origin_cell text not null,
  dest_cell text not null,
  drive_secs numeric not null,
  dist_m numeric not null,
  source text default 'osrm'::text not null,
  computed_at timestamp with time zone default now() not null,
  constraint travel_matrix_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  constraint travel_matrix_pkey PRIMARY KEY (city_id, origin_cell, dest_cell)
);

alter table public.travel_matrix enable row level security;

CREATE INDEX idx_travel_matrix_stale ON public.travel_matrix USING btree (city_id, computed_at);

create policy "travel_matrix_select_staff" on public.travel_matrix for select to public
  using ((is_staff() AND (city_id = current_user_city_id())));

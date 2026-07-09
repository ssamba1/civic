-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_057_org_unit_routing_fields.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

alter table public.org_units
  add column if not exists depot geography(Point,4326),
  add column if not exists parallelism integer default 1 not null,
  add column if not exists shift_windows jsonb,
  add column if not exists emergency_reserve numeric default 0 not null;

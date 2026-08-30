-- 057b org_units routing/contractor columns — ghost-DDL recovery.
--
-- Found by the fresh-deploy CI gate (.github/workflows/migrations.yml) on
-- 2026-08-30: migration 060 selects o.is_contractor, o.contractor_id,
-- o.capacity, o.cost_per_job and o.sla_hours, and no migration ever created
-- them. They exist on the live project — confirmed by querying each column
-- through PostgREST — so this is the same class of drift that 33ec7d9 was
-- written to clean up: DDL applied by hand or through the Management API and
-- never committed.
--
-- Effect before this file: a NEW city deployment fails at 060 with
-- "column o.contractor_id does not exist", and every later migration that
-- depends on routing_unit_load fails with it (068 among them). The live
-- project was fine, which is exactly why nobody noticed.
--
-- Numbered 057b, not 070, because it has to run BEFORE 060. The repo already
-- uses this suffix convention (023b, 032b, 036b/c/d, 041b). Ordering that
-- matters here:
--   042  creates org_units
--   053  creates contractors  (the FK target below)
--   057  recovered depot / parallelism / shift_windows / emergency_reserve
--   057b THIS FILE — the five columns 057 did not capture
--   060  routing_unit_load(), which reads all of them
--
-- Types are taken from the live function's own signature in 060, which was
-- itself introspected from prod, so they match what is deployed.
--
-- Idempotent: safe to re-run, and a no-op against the live project where the
-- columns already exist.

alter table public.org_units
  -- Whether this unit is an external contractor crew rather than city staff.
  add column if not exists is_contractor boolean not null default false,
  -- The contractor this unit belongs to, when is_contractor is true.
  add column if not exists contractor_id uuid,
  -- Concurrent work orders the unit can hold before the router treats it as full.
  add column if not exists capacity integer,
  -- Cost basis the router balances against travel time when choosing a unit.
  add column if not exists cost_per_job numeric,
  -- Unit-level SLA override; falls back to the category target when null.
  add column if not exists sla_hours integer;

-- FK added separately so the column add stays idempotent even on a database
-- where contractors has not been created yet for some reason.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'contractors')
     and not exists (select 1 from information_schema.table_constraints
                     where constraint_schema = 'public'
                       and constraint_name = 'org_units_contractor_id_fkey')
  then
    alter table public.org_units
      add constraint org_units_contractor_id_fkey
      foreign key (contractor_id) references public.contractors (id)
      on delete set null;
  end if;
end $$;

-- The router filters to contractor units when a job is outsourced; without this
-- that predicate scans every unit in the city.
create index if not exists idx_org_units_contractor
  on public.org_units (contractor_id)
  where contractor_id is not null;

comment on column public.org_units.is_contractor is
  'True when this unit is an external contractor crew. Recovered in 057b.';
comment on column public.org_units.contractor_id is
  'Owning contractor when is_contractor. Recovered in 057b.';

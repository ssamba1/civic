-- Drop the duplicate work_orders.assigned_crew_id → crews(id) foreign key.
--
-- 030_crews.sql created the canonical constraint as
-- `work_orders_assigned_crew_fkey`. 051_wo_scheduling.sql then "retro-fitted"
-- the same FK, but its existence guard only looked for its OWN candidate name
-- (`work_orders_assigned_crew_id_fkey`) and never for 030's — so on any DB
-- where 030 had already run, 051 added a second, byte-identical FK on the same
-- column.
--
-- Why that is not harmless: PostgREST resolves embeddings by foreign key, and
-- two FKs between the same pair of tables make `work_orders?select=...,crews(name)`
-- ambiguous — it returns PGRST201 instead of rows. src/lib/db/calendar.ts is
-- the caller that trips this; it catches query errors and returns [], so the
-- staff calendar silently rendered "0 work orders" for every city regardless of
-- how much data was in the table.
--
-- Dropping one of two identical constraints is behaviourally inert for the
-- database (the remaining FK enforces exactly the same rule with the same
-- ON DELETE SET NULL) and restores a single unambiguous embedding path.
-- 051 is left as-is rather than retro-edited; this runs after it and converges
-- both fresh and existing databases on 030's name.

ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_assigned_crew_id_fkey;

-- Fresh databases that somehow ran 051 before 030 would be left with only the
-- 051 name; re-assert the canonical one so the end state is identical either way.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.work_orders'::regclass
       AND conname  = 'work_orders_assigned_crew_fkey'
  ) THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_assigned_crew_fkey
        FOREIGN KEY (assigned_crew_id) REFERENCES public.crews (id)
        ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- 051: Work-order scheduling columns
-- Adds nullable scheduling fields to work_orders so staff can book a future
-- service window. Also retro-fits the FK for assigned_crew_id (the column has
-- existed since migration 001 as a plain uuid; the crews table landed in 030).
--
-- RLS: inherits work_orders existing policies unchanged. Any UPDATE already
-- requires is_staff() AND the report's city_id matching the actor's city. No
-- new policies needed; the new columns are simply updatable by the same set of
-- actors that can already UPDATE work_orders.

-- New scheduling columns (skipped silently if already applied).
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS scheduled_for        timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_window_end timestamptz;

-- Retro-fit FK on the existing assigned_crew_id column (plain uuid since 001).
-- crews table exists from migration 030. Use IF NOT EXISTS idiom via DO block
-- to keep the migration idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_orders_assigned_crew_id_fkey'
      AND table_name = 'work_orders'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_assigned_crew_id_fkey
        FOREIGN KEY (assigned_crew_id) REFERENCES crews (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Fast range scans for the schedule calendar view.
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled_for
  ON work_orders (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

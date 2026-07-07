-- 030: Crews — sub-team org units under a division (team_key), plus the
-- membership join table. Fills the gap designed-for on day 1: work_orders has
-- carried a dangling assigned_crew_id uuid since 001 with no crews table.
--
--   city_teams (division, per-city enable/rename of preset TeamId)
--     └── crews (named unit inside one division, e.g. "North Paving Crew")
--           └── crew_members (person ↔ crew, many-to-many, is_lead flag)
--
-- crew_type is the AI work-order labor type (CREW_TYPES in
-- src/lib/ai/work-order-schema.ts: paving, line_crew, sign_crew, cleanup,
-- concrete, arborist, drain_crew). Matching it against work_orders.crew_type
-- powers dispatch auto-suggest. Free text (not an enum) — the AI list is
-- app-level and cities may add bespoke crews.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Parent division: app-level TeamId (text), same key space as
  -- city_teams.team_key / users.team_key. Not "all".
  team_key   text NOT NULL CHECK (team_key <> 'all'),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  crew_type  text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, team_key, name)
);

CREATE TABLE IF NOT EXISTS crew_members (
  crew_id  uuid NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Lead is a property of the membership (a lead must be on the crew; a
  -- person can lead one crew and work on another).
  is_lead  boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crews_city_team ON crews (city_id, team_key);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members (user_id);

-- ---------------------------------------------------------------------------
-- 2. Wire the dangling FK. crews is empty at migration time, so every
--    pre-existing non-null assigned_crew_id points at nothing — null them
--    before adding the constraint.
-- ---------------------------------------------------------------------------

UPDATE work_orders SET assigned_crew_id = NULL WHERE assigned_crew_id IS NOT NULL;

ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_assigned_crew_fkey;
ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_assigned_crew_fkey
  FOREIGN KEY (assigned_crew_id) REFERENCES crews (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS — unlike city_teams (public read: just labels), crew rows and
--    membership expose staff names → staff-only read, scoped to own city.
--    Writes are admin-gated at the action layer (service role bypasses RLS);
--    the staff-write policy mirrors the 024 config tables as defense in depth.
-- ---------------------------------------------------------------------------

ALTER TABLE crews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crews_select_staff ON crews;
CREATE POLICY crews_select_staff ON crews
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS crews_write_staff ON crews;
CREATE POLICY crews_write_staff ON crews
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

-- crew_members has no city_id — scope through the parent crew.
DROP POLICY IF EXISTS crew_members_select_staff ON crew_members;
CREATE POLICY crew_members_select_staff ON crew_members
  FOR SELECT USING (
    is_staff() AND EXISTS (
      SELECT 1 FROM crews c
      WHERE c.id = crew_id AND c.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS crew_members_write_staff ON crew_members;
CREATE POLICY crew_members_write_staff ON crew_members
  FOR ALL
  USING (
    is_staff() AND EXISTS (
      SELECT 1 FROM crews c
      WHERE c.id = crew_id AND c.city_id = current_user_city_id()
    )
  )
  WITH CHECK (
    is_staff() AND EXISTS (
      SELECT 1 FROM crews c
      WHERE c.id = crew_id AND c.city_id = current_user_city_id()
    )
  );

GRANT SELECT ON crews, crew_members TO authenticated;
GRANT INSERT, UPDATE, DELETE ON crews, crew_members TO authenticated;

COMMENT ON TABLE crews IS 'Sub-team org units (crews) inside a division (team_key). 030.';
COMMENT ON TABLE crew_members IS 'Person-to-crew membership; is_lead marks the crew lead. 030.';
COMMENT ON COLUMN crews.crew_type IS 'AI labor type (CREW_TYPES) for dispatch auto-suggest; free text.';

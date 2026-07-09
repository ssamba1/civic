-- 042: org_units — recursive org tree (ltree) for advanced routing.
--
-- Supersedes the flat two-level model (city_teams division → crews) with an
-- arbitrary-depth tree:
--
--   team (root)
--     └── subteam …            (any depth)
--           └── crew           (internal, assignable leaf)
--           └── contractor     (external vendor, assignable leaf)
--
-- One self-referencing table subsumes city_teams (as team roots), crews (as
-- crew leaves) and crew_types (as per-unit `skills`). The old tables are left
-- in place this release for rollback + gradual app migration; a later
-- migration drops them once every reader moves to org_units.
--
-- Routing (app layer, src/lib/routing/org-units.ts):
--   1. prune  — candidate LEAF units whose (inherited) categories include the
--               report category AND whose skills include the work order's
--               crew_type;
--   2. score  — cost/SLA-weighted load balance across the candidates, so a
--               mix of internal crews and external contractors is balanced by
--               fill (open_wos / capacity), cost_per_job and SLA-breach risk —
--               not just fewest-open-WO. Internal spillover to contractors is
--               the emergent default (contractor cost > 0 loses until internal
--               crews are full).
--
-- path is a materialized ltree of sanitized row ids (uuid, dashes stripped —
-- valid ltree labels, globally unique, stable). Human labels live in `label`;
-- `path` exists only for fast subtree queries (`path <@ :team_path`).

CREATE EXTENSION IF NOT EXISTS ltree;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS org_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  parent_id     uuid REFERENCES org_units (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('team', 'subteam', 'crew', 'contractor')),
  -- Stable key, unique among siblings. Human-facing name is `label`.
  key           text NOT NULL CHECK (length(trim(key)) > 0),
  label         text NOT NULL CHECK (length(trim(label)) > 0),
  -- Report categories this unit accepts. NULL = inherit from nearest ancestor
  -- that sets it (a subteam under a team need not restate the team's scope).
  categories    text[],
  -- crew_type keys (031 crew_types.key) this unit can physically perform.
  skills        text[] NOT NULL DEFAULT '{}',
  is_contractor boolean NOT NULL DEFAULT false,
  -- Max concurrent OPEN work orders. NULL = unbounded (typical internal crew).
  capacity      integer CHECK (capacity IS NULL OR capacity > 0),
  -- Per-job cost. NULL/0 = internal (no marginal cost). Drives the cost term.
  cost_per_job  numeric CHECK (cost_per_job IS NULL OR cost_per_job >= 0),
  -- Expected turnaround; feeds the SLA-breach-risk term against work_orders.due_at.
  sla_hours     integer CHECK (sla_hours IS NULL OR sla_hours > 0),
  active        boolean NOT NULL DEFAULT true,
  -- Back-link to the crews row this unit was backfilled from, so existing
  -- work_orders.assigned_crew_id can map to assigned_unit_id. NULL for units
  -- created natively (contractors, AI-generated subteams).
  legacy_crew_id uuid,
  path          ltree NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Sibling-unique key. parent_id NULL (roots) compares as distinct in a plain
-- UNIQUE, so split into two partial indexes to actually forbid duplicate roots.
CREATE UNIQUE INDEX IF NOT EXISTS org_units_root_key
  ON org_units (city_id, key) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_units_child_key
  ON org_units (city_id, parent_id, key) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS org_units_path_gist ON org_units USING gist (path);
CREATE INDEX IF NOT EXISTS org_units_city_active ON org_units (city_id) WHERE active;
CREATE INDEX IF NOT EXISTS org_units_parent ON org_units (parent_id);
CREATE INDEX IF NOT EXISTS org_units_legacy_crew ON org_units (legacy_crew_id) WHERE legacy_crew_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Path maintenance. Label = row id with dashes stripped (hex + digits =
--    valid ltree label, unique, stable). id is populated by the column DEFAULT
--    before BEFORE triggers fire, so it is available here on INSERT.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_units_sync_path() RETURNS trigger AS $$
DECLARE
  parent_path ltree;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := text2ltree(replace(NEW.id::text, '-', ''));
  ELSE
    SELECT path INTO parent_path FROM org_units WHERE id = NEW.parent_id;
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'org_units: parent % not found', NEW.parent_id;
    END IF;
    -- Guard against cycles: a node cannot sit under its own subtree.
    IF parent_path <@ text2ltree(replace(NEW.id::text, '-', '')) THEN
      RAISE EXCEPTION 'org_units: cycle — % cannot be a descendant of itself', NEW.id;
    END IF;
    NEW.path := parent_path || text2ltree(replace(NEW.id::text, '-', ''));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_units_sync_path_trg ON org_units;
CREATE TRIGGER org_units_sync_path_trg
  BEFORE INSERT OR UPDATE OF parent_id ON org_units
  FOR EACH ROW EXECUTE FUNCTION org_units_sync_path();

-- Re-parenting: rewrite every descendant's path prefix. Runs AFTER so NEW.path
-- (set by the BEFORE trigger) is final.
CREATE OR REPLACE FUNCTION org_units_cascade_path() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE org_units
      SET path = NEW.path || subpath(path, nlevel(OLD.path))
      WHERE path <@ OLD.path AND id <> NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_units_cascade_path_trg ON org_units;
CREATE TRIGGER org_units_cascade_path_trg
  AFTER UPDATE OF parent_id ON org_units
  FOR EACH ROW EXECUTE FUNCTION org_units_cascade_path();

-- ---------------------------------------------------------------------------
-- 3. work_orders.assigned_unit_id — the new assignment target. Kept alongside
--    the legacy assigned_crew_id (030) during the transition.
-- ---------------------------------------------------------------------------

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS assigned_unit_id uuid REFERENCES org_units (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_unit
  ON work_orders (assigned_unit_id) WHERE assigned_unit_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill from city_teams + crews. Idempotent (ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------------

-- 4a. Team roots from onboarded city_teams (carry their category scope).
INSERT INTO org_units (city_id, parent_id, kind, key, label, categories)
SELECT city_id, NULL::uuid, 'team', team_key, label, categories
FROM city_teams
WHERE enabled = true
ON CONFLICT DO NOTHING;

-- 4b. Team roots referenced by a crew but absent above (city never onboarded
--     that division via the wizard). Label falls back to the key.
INSERT INTO org_units (city_id, parent_id, kind, key, label)
SELECT DISTINCT c.city_id, NULL::uuid, 'team', c.team_key, c.team_key
FROM crews c
WHERE NOT EXISTS (
  SELECT 1 FROM org_units o
  WHERE o.city_id = c.city_id AND o.parent_id IS NULL AND o.key = c.team_key
)
ON CONFLICT DO NOTHING;

-- 4c. Crews become crew leaves under their team root. Key is id-derived
--     (crew names are not sibling-unique across re-creations); skills carry the
--     single crew_type. legacy_crew_id preserves the link for step 4d.
INSERT INTO org_units (city_id, parent_id, kind, key, label, skills, active, legacy_crew_id)
SELECT
  c.city_id,
  t.id,
  'crew',
  'crew_' || replace(c.id::text, '-', ''),
  c.name,
  CASE WHEN c.crew_type IS NOT NULL THEN ARRAY[c.crew_type] ELSE '{}'::text[] END,
  c.active,
  c.id
FROM crews c
JOIN org_units t
  ON t.city_id = c.city_id AND t.parent_id IS NULL AND t.key = c.team_key
ON CONFLICT DO NOTHING;

-- 4d. Carry existing crew assignments onto the new column.
UPDATE work_orders w
SET assigned_unit_id = o.id
FROM org_units o
WHERE o.legacy_crew_id = w.assigned_crew_id
  AND w.assigned_crew_id IS NOT NULL
  AND w.assigned_unit_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS — mirror crews (030): org_units expose staff/roster structure and
--    contractor pricing → staff-only read scoped to own city; staff-write as
--    defense in depth (admin-gated at the action layer, service role bypasses).
-- ---------------------------------------------------------------------------

ALTER TABLE org_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_units_select_staff ON org_units;
CREATE POLICY org_units_select_staff ON org_units
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS org_units_write_staff ON org_units;
CREATE POLICY org_units_write_staff ON org_units
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON org_units TO authenticated;
GRANT INSERT, UPDATE, DELETE ON org_units TO authenticated;

COMMENT ON TABLE org_units IS 'Recursive org tree (ltree) for advanced routing; subsumes city_teams/crews/crew_types. 042.';
COMMENT ON COLUMN org_units.path IS 'Materialized ltree of dash-stripped row ids; subtree queries via path <@ ancestor.';
COMMENT ON COLUMN org_units.categories IS 'Accepted report categories; NULL inherits from nearest ancestor that sets it.';
COMMENT ON COLUMN org_units.skills IS 'crew_type keys (031) this unit can perform; matched against work_orders.crew_type.';
COMMENT ON COLUMN org_units.capacity IS 'Max concurrent open work orders; NULL = unbounded. Feeds the load-balance fill term.';
COMMENT ON COLUMN org_units.cost_per_job IS 'Marginal per-job cost; NULL/0 = internal. Drives the cost term (contractor spillover).';
COMMENT ON COLUMN org_units.legacy_crew_id IS 'Source crews.id for backfilled units; maps assigned_crew_id → assigned_unit_id.';

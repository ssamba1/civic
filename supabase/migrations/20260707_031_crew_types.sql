-- 031: crew_types — per-city catalog of crew labor types with AI-facing
-- descriptions.
--
-- Before this, the crew-type list was a hardcoded 7-value enum duplicated in
-- three app files (work-order-schema, crew-actions, crews-panel). Cities now
-- define their own types; the description is what the work-order AI reads to
-- pick the right crew_type for a report ("concrete — flatwork, sidewalk panel
-- replacement, ADA ramps"). crews.crew_type stays a SOFT key reference into
-- this table (no hard FK) — same pattern as issue_types.team_key (027):
-- deleting a type never breaks existing crews, the UI just shows the raw key.
--
-- App fallback: when a city has zero rows (or the table is missing on an
-- un-migrated DB), the app uses DEFAULT_CREW_TYPES in src/lib/crew-types.ts —
-- the same 7 defaults seeded below.

CREATE TABLE IF NOT EXISTS crew_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Stable slug used on crews.crew_type / work_orders.crew_type.
  key         text NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  label       text NOT NULL CHECK (length(trim(label)) > 0),
  -- AI-facing capability text: what work this crew type physically does.
  description text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, key)
);

CREATE INDEX IF NOT EXISTS idx_crew_types_city ON crew_types (city_id);

-- ---------------------------------------------------------------------------
-- Seed: the 7 app defaults for every existing city. Descriptions here must
-- stay in sync with DEFAULT_CREW_TYPES in src/lib/crew-types.ts.
-- ---------------------------------------------------------------------------

INSERT INTO crew_types (city_id, key, label, description)
SELECT c.id, d.key, d.label, d.description
FROM cities c
CROSS JOIN (
  VALUES
    ('paving', 'Paving', 'Asphalt work — pothole patching, road surface repair, resurfacing prep.'),
    ('line_crew', 'Line Crew', 'Electrical and utility line work — streetlights, downed lines, powered signals.'),
    ('sign_crew', 'Sign Crew', 'Traffic sign installation and replacement — downed, faded, or damaged signage.'),
    ('cleanup', 'Cleanup', 'Debris removal, illegal dump cleanup, graffiti abatement, general site cleanup.'),
    ('concrete', 'Concrete', 'Concrete flatwork — sidewalk panel replacement, curbs, gutters, ADA ramps.'),
    ('arborist', 'Arborist', 'Tree work — fallen tree removal, limb trimming, hazardous tree assessment.'),
    ('drain_crew', 'Drain Crew', 'Stormwater and drainage — clogged drains, culverts, standing water, water leaks.')
) AS d (key, label, description)
ON CONFLICT (city_id, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS — mirror crews (030): staff-only read scoped to own city; staff-write
-- policy as defense in depth (writes are admin-gated at the action layer and
-- run through the service role, which bypasses RLS).
-- ---------------------------------------------------------------------------

ALTER TABLE crew_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crew_types_select_staff ON crew_types;
CREATE POLICY crew_types_select_staff ON crew_types
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS crew_types_write_staff ON crew_types;
CREATE POLICY crew_types_write_staff ON crew_types
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON crew_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON crew_types TO authenticated;

COMMENT ON TABLE crew_types IS 'Per-city crew labor type catalog; description feeds the work-order AI. 031.';
COMMENT ON COLUMN crew_types.key IS 'Slug referenced (softly) by crews.crew_type and work_orders.crew_type.';
COMMENT ON COLUMN crew_types.description IS 'AI-facing capability text used when picking crew_type for a work order.';

-- 031: city_crew_types — per-city CUSTOM crew labor types, additive to the
-- 7 built-ins hardcoded in src/lib/crew-types.ts (paving, line_crew,
-- sign_crew, cleanup, concrete, arborist, drain_crew — those never get rows
-- here; the app rejects reserved names).
--
-- description is the AI-routing signal: >=10 words describing what the crew
-- does, injected into the work-order generator prompt so Gemini can route
-- matching work orders to this type (crews.crew_type and
-- work_orders.crew_type are already free text — no change needed there).
-- The word-count rule is enforced app-side (zod, both client and server);
-- the CHECK below only guards non-empty.

CREATE TABLE IF NOT EXISTS city_crew_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Canonical snake_case name (see normalizeCrewTypeName): 2-40 chars.
  name        text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9_]{1,39}$'),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, name)
);

CREATE INDEX IF NOT EXISTS idx_city_crew_types_city ON city_crew_types (city_id);

-- RLS — same posture as crews (030): staff-only read scoped to own city
-- (descriptions are internal operational config), staff write as defense in
-- depth (the admin-gated server action runs service-role and bypasses RLS).

ALTER TABLE city_crew_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_crew_types_select_staff ON city_crew_types;
CREATE POLICY city_crew_types_select_staff ON city_crew_types
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS city_crew_types_write_staff ON city_crew_types;
CREATE POLICY city_crew_types_write_staff ON city_crew_types
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON city_crew_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON city_crew_types TO authenticated;

COMMENT ON TABLE city_crew_types IS 'Per-city custom crew labor types, additive to the built-in 7. 031.';
COMMENT ON COLUMN city_crew_types.description IS 'What this crew does (>=10 words, app-enforced) — injected into the AI work-order prompt for routing.';

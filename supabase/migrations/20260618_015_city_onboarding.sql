-- =============================================================================
-- Civic – City Onboarding
-- Migration: 20260618_015_city_onboarding.sql
--
-- Adds the schema needed for self-serve city onboarding:
--   * cities.center      – geocoded center point (map centering; boundary deferred)
--   * cities.created_by  – the admin user who provisioned the city
--   * users.team_key     – staff↔team assignment (per-person or shared-team account)
--   * users.is_shared    – marks a shared-per-team login (no per-person identity)
--   * city_teams         – per-city team config (which presets are enabled, their
--                          labels, and which report categories each owns). This is
--                          the DB-backed, per-city replacement for the localStorage
--                          routing overrides (see src/lib/category-overrides.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. cities: center point + creator
-- ---------------------------------------------------------------------------
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS center     geography(POINT, 4326),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. users: team assignment + shared-login flag
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team_key  text,
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_city_team ON users (city_id, team_key);

-- ---------------------------------------------------------------------------
-- 3. city_teams: per-city team configuration + category routing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS city_teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  team_key   text NOT NULL,                      -- preset TeamId, e.g. 'streets_roads'
  label      text NOT NULL,                      -- per-city display name (may be renamed)
  enabled    boolean NOT NULL DEFAULT true,
  categories text[] NOT NULL DEFAULT '{}',       -- ReportCategory[] this team owns in this city
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, team_key)
);

CREATE INDEX IF NOT EXISTS idx_city_teams_city ON city_teams (city_id);

-- ---------------------------------------------------------------------------
-- 4. RLS: city_teams is public-readable (like cities); writes are service-role
--    only (provisioning server action). Default-deny covers writes.
-- ---------------------------------------------------------------------------
ALTER TABLE city_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY city_teams_select ON city_teams
  FOR SELECT USING (true);

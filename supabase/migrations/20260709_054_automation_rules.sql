-- =============================================================================
-- Civic – Automation Rules Engine
-- Migration: 20260709_054_automation_rules.sql
--
-- Design:
--   Lets city admins configure IF/THEN automation rules evaluated when a
--   report is classified by the AI pipeline. Rules are evaluated in ascending
--   priority order; within a given action type the first matching rule wins
--   (see evaluateRules in src/lib/automation/rules.ts).
--
-- conditions JSON schema (array of Condition objects):
--   [
--     {
--       "field": "category" | "severity" | "is_emergency" | "tag",
--       "op":    "eq" | "gte" | "lte" | "in" | "contains",
--       "value": string | number | boolean | string[]
--     },
--     ...
--   ]
--   All conditions in the array must match (AND logic).
--
-- actions JSON schema (array of Action objects):
--   [
--     { "type": "set_priority",      "value": "low" | "medium" | "high" | "critical" },
--     { "type": "assign_team",       "value": "<team_key>" },
--     { "type": "auto_acknowledge",  "value": true },
--     { "type": "add_tag",           "value": "<tag_string>" },
--     { "type": "set_severity",      "value": 1 | 2 | 3 | 4 | 5 }
--   ]
--
-- RLS strategy: mirror webhook_endpoints pattern (20260709_047_webhooks.sql).
--   Admin = full CRUD. Staff = read-only. Default deny.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. automation_rules table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT '',
  enabled     boolean     NOT NULL DEFAULT true,
  priority    integer     NOT NULL DEFAULT 0,

  -- Array of Condition objects (see schema in header comment above)
  conditions  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Array of Action objects (see schema in header comment above)
  actions     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_automation_rules_city_enabled
  ON automation_rules (city_id, enabled);

CREATE INDEX IF NOT EXISTS idx_automation_rules_city_priority
  ON automation_rules (city_id, priority);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (reuse pattern from other tables if function exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION set_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END;
$$;

CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — default deny, admin full access, staff read-only
-- ---------------------------------------------------------------------------
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "automation_rules_admin_all" ON automation_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- Staff: read only (dispatcher + supervisor can see rules to understand routing)
CREATE POLICY "automation_rules_staff_read" ON automation_rules
  FOR SELECT
  USING (is_staff());

COMMIT;

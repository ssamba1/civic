-- =============================================================================
-- Civic – Initial Schema
-- Migration: 20260527_001_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
  'resident',
  'staff_dispatcher',
  'staff_supervisor',
  'admin'
);

CREATE TYPE report_status AS ENUM (
  'open',
  'dispatched',
  'in_progress',
  'closed',
  'merged',
  'rejected'
);

CREATE TYPE classification_category AS ENUM (
  'pothole',
  'streetlight',
  'downed_sign',
  'graffiti',
  'illegal_dump',
  'water_leak',
  'sidewalk_damage',
  'tree_down',
  'debris',
  'drainage',
  'faded_signage',
  'other'
);

-- Department enum: derived from the work-order rules table in design doc §4.5.
-- Covers the common small-city departments that handle infrastructure repair.
CREATE TYPE work_order_department AS ENUM (
  'public_works',
  'utilities',
  'parks',
  'code_enforcement',
  'sanitation',
  'other'
);

CREATE TYPE verification_vote AS ENUM (
  'confirmed',
  'disputed'
);

-- ---------------------------------------------------------------------------
-- 2. Tables (FK-dependency order)
-- ---------------------------------------------------------------------------

-- 2.1 cities
CREATE TABLE cities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  state       text NOT NULL,
  boundary    geography(POLYGON, 4326),
  open311_jurisdiction_id text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.2 users
CREATE TABLE users (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  city_id       uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
  role          user_role NOT NULL DEFAULT 'resident',
  email         text,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2.3 reports
-- submit_duration_ms: populated by client to track time-to-submit metric
CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
  reporter_id       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  location          geography(POINT, 4326) NOT NULL,
  photo_public_url  text NOT NULL,
  photo_raw_url     text,
  status            report_status NOT NULL DEFAULT 'open',
  address           text,
  description       text,
  submit_duration_ms int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2.4 classifications (one-to-one with reports)
CREATE TABLE classifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id             uuid NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  category              classification_category NOT NULL,
  subcategory           text,
  severity              int NOT NULL CHECK (severity BETWEEN 1 AND 5),
  hazard_radius_m       numeric,
  visible_size_estimate text,
  is_emergency          boolean NOT NULL DEFAULT false,
  confidence            numeric CHECK (confidence BETWEEN 0 AND 1),
  reasoning             text,
  model_version         text,
  raw_response          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 2.5 work_orders (one-to-one with reports)
CREATE TABLE work_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id             uuid NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  department            work_order_department NOT NULL,
  crew_type             text,
  priority_score        numeric NOT NULL DEFAULT 0,
  est_minutes           int,
  materials             jsonb DEFAULT '[]'::jsonb,
  assigned_crew_id      uuid,
  dispatched_at         timestamptz,
  completed_at          timestamptz,
  resolution_photo_url  text,
  resolution_ai_score   numeric,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 2.6 assets
CREATE TABLE assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT,
  asset_type  text NOT NULL,
  location    geography(POINT, 4326) NOT NULL,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.7 merges
CREATE TABLE merges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_report_id   uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  duplicate_report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  similarity_score    numeric CHECK (similarity_score BETWEEN 0 AND 1),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (primary_report_id <> duplicate_report_id)
);

-- 2.8 verifications (one vote per user per report)
CREATE TABLE verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  vote        verification_vote NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);

-- 2.9 audit_log
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  action      text NOT NULL,
  table_name  text NOT NULL,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- GiST on geography columns
CREATE INDEX idx_cities_boundary      ON cities      USING gist (boundary);
CREATE INDEX idx_reports_location     ON reports     USING gist (location);
CREATE INDEX idx_assets_location      ON assets      USING gist (location);

-- B-tree for common filters
CREATE INDEX idx_reports_city_id      ON reports     (city_id);
CREATE INDEX idx_reports_status       ON reports     (status);
CREATE INDEX idx_reports_created_at   ON reports     (created_at DESC);
CREATE INDEX idx_reports_reporter_id  ON reports     (reporter_id);

CREATE INDEX idx_users_city_id        ON users       (city_id);
CREATE INDEX idx_users_role           ON users       (role);

CREATE INDEX idx_classifications_report_id ON classifications (report_id);
CREATE INDEX idx_work_orders_report_id     ON work_orders     (report_id);
CREATE INDEX idx_work_orders_department    ON work_orders     (department);
CREATE INDEX idx_work_orders_priority      ON work_orders     (priority_score DESC);

CREATE INDEX idx_merges_primary       ON merges      (primary_report_id);
CREATE INDEX idx_merges_duplicate     ON merges      (duplicate_report_id);

CREATE INDEX idx_verifications_report ON verifications (report_id);

CREATE INDEX idx_audit_log_record     ON audit_log   (table_name, record_id);
CREATE INDEX idx_audit_log_created    ON audit_log   (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Audit trigger (attached to tables where staff writes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_reports_audit
  AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_work_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6. RLS helper functions (SECURITY DEFINER to bypass RLS on users table)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_city_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT city_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role IN ('staff_dispatcher', 'staff_supervisor', 'admin')
  FROM public.users
  WHERE id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 7. Enable RLS (default deny on all tables)
-- ---------------------------------------------------------------------------
ALTER TABLE cities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE merges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8. RLS Policies
-- ---------------------------------------------------------------------------

-- 8.1 cities: readable by everyone (public data)
CREATE POLICY cities_select ON cities
  FOR SELECT USING (true);

-- 8.2 users
-- Residents see only their own row
CREATE POLICY users_select_own ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Staff see other staff in their city
CREATE POLICY users_select_staff ON users
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND city_id = current_user_city_id()
  );

-- Users can update their own profile
CREATE POLICY users_update_own ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 8.3 reports
-- Residents can SELECT their own reports
CREATE POLICY reports_select_own ON reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Staff can SELECT all reports in their city
CREATE POLICY reports_select_staff ON reports
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND city_id = current_user_city_id()
  );

-- Residents can INSERT reports (must be their own city, themselves as reporter)
CREATE POLICY reports_insert_resident ON reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND city_id = current_user_city_id()
  );

-- Staff can UPDATE reports in their city
CREATE POLICY reports_update_staff ON reports
  FOR UPDATE
  TO authenticated
  USING (
    is_staff()
    AND city_id = current_user_city_id()
  )
  WITH CHECK (
    is_staff()
    AND city_id = current_user_city_id()
  );

-- 8.4 classifications: staff can SELECT for their city
CREATE POLICY classifications_select_staff ON classifications
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = classifications.report_id
        AND r.city_id = current_user_city_id()
    )
  );

-- Report owner can see classification of their own report
CREATE POLICY classifications_select_own ON classifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = classifications.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- 8.5 work_orders: only staff can SELECT/UPDATE for their city
CREATE POLICY work_orders_select_staff ON work_orders
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = work_orders.report_id
        AND r.city_id = current_user_city_id()
    )
  );

CREATE POLICY work_orders_update_staff ON work_orders
  FOR UPDATE
  TO authenticated
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = work_orders.report_id
        AND r.city_id = current_user_city_id()
    )
  )
  WITH CHECK (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = work_orders.report_id
        AND r.city_id = current_user_city_id()
    )
  );

-- 8.6 assets: staff can read for their city
CREATE POLICY assets_select_staff ON assets
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND city_id = current_user_city_id()
  );

-- 8.7 merges: staff can read for their city
CREATE POLICY merges_select_staff ON merges
  FOR SELECT
  TO authenticated
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = merges.primary_report_id
        AND r.city_id = current_user_city_id()
    )
  );

-- 8.8 verifications: authenticated users can read and insert for reports in their city
CREATE POLICY verifications_select ON verifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = verifications.report_id
        AND r.city_id = current_user_city_id()
    )
  );

CREATE POLICY verifications_insert ON verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = verifications.report_id
        AND r.city_id = current_user_city_id()
    )
  );

-- 8.9 audit_log: only admins can read
CREATE POLICY audit_log_select_admin ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- 9. Public dashboard view (strips PII — no reporter_id, no email)
-- ---------------------------------------------------------------------------
CREATE VIEW dashboard_reports_view AS
SELECT
  r.id,
  r.city_id,
  c_city.slug   AS city_slug,
  c_city.name   AS city_name,
  r.location,
  r.photo_public_url,
  r.status,
  r.address,
  r.description,
  r.created_at,
  r.updated_at,
  cl.category,
  cl.subcategory,
  cl.severity,
  cl.hazard_radius_m,
  cl.visible_size_estimate,
  cl.is_emergency,
  cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
WHERE r.status NOT IN ('rejected');

-- Grant anon + authenticated read access on the dashboard view
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

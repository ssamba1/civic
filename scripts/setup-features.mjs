// Migration 005 (applied via direct connection): resident tags + upvotes.
// reports.tags, reports.upvote_count, report_upvotes table + count trigger + RLS,
// and dashboard view refreshed to expose upvote_count + tags.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const SQL = `
ALTER TABLE reports ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS upvote_count int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS report_upvotes (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_report_upvotes_report ON report_upvotes(report_id);

CREATE OR REPLACE FUNCTION bump_upvote_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reports SET upvote_count = upvote_count + 1 WHERE id = NEW.report_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reports SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.report_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_report_upvotes_count ON report_upvotes;
CREATE TRIGGER trg_report_upvotes_count
  AFTER INSERT OR DELETE ON report_upvotes
  FOR EACH ROW EXECUTE FUNCTION bump_upvote_count();

ALTER TABLE report_upvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upvotes_select ON report_upvotes;
CREATE POLICY upvotes_select ON report_upvotes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM reports r
                 WHERE r.id = report_upvotes.report_id
                   AND r.city_id = current_user_city_id()));

DROP POLICY IF EXISTS upvotes_insert ON report_upvotes;
CREATE POLICY upvotes_insert ON report_upvotes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND EXISTS (SELECT 1 FROM reports r
                          WHERE r.id = report_upvotes.report_id
                            AND r.city_id = current_user_city_id()));

DROP POLICY IF EXISTS upvotes_delete ON report_upvotes;
CREATE POLICY upvotes_delete ON report_upvotes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP VIEW IF EXISTS dashboard_reports_view;
CREATE VIEW dashboard_reports_view AS
SELECT r.id, r.city_id, c.slug AS city_slug, c.name AS city_name,
  ST_X(r.location::geometry) AS lng,
  ST_Y(r.location::geometry) AS lat,
  r.photo_public_url, r.status, r.address, r.created_at, r.updated_at,
  r.upvote_count, r.tags,
  cl.category, cl.subcategory, cl.severity, cl.hazard_radius_m,
  cl.visible_size_estimate, cl.is_emergency, cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c ON c.id = r.city_id
WHERE r.status NOT IN ('rejected');
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;
`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(SQL);
  console.log("migration 005 (tags + upvotes) applied OK");
} catch (e) {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

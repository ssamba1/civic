// Migration 005 (applied via direct connection): resident tags.
// reports.tags + dashboard view refreshed to expose tags.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const SQL = `
ALTER TABLE reports ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DROP VIEW IF EXISTS dashboard_reports_view;
CREATE VIEW dashboard_reports_view AS
SELECT r.id, r.city_id, c.slug AS city_slug, c.name AS city_name,
  ST_X(r.location::geometry) AS lng,
  ST_Y(r.location::geometry) AS lat,
  r.photo_public_url, r.status, r.address, r.created_at, r.updated_at,
  r.tags,
  cl.category, cl.subcategory, cl.severity, cl.hazard_radius_m,
  cl.visible_size_estimate, cl.is_emergency, cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c ON c.id = r.city_id
WHERE r.status NOT IN ('rejected');
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;
`;

const client = new pg.Client({ connectionString: url, ssl: true });
await client.connect();
try {
  await client.query(SQL);
  console.log("migration 005 (tags) applied OK");
} catch (e) {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

// Dashboard data layer: recreate the public view with lng/lat exposed
// (fixes Open311/map location), plus per-city stats + category RPCs.
// Applied via direct connection (owner-safe public-schema objects).
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const SQL = `
DROP VIEW IF EXISTS dashboard_reports_view;
CREATE VIEW dashboard_reports_view AS
SELECT r.id, r.city_id, c.slug AS city_slug, c.name AS city_name,
  ST_X(r.location::geometry) AS lng,
  ST_Y(r.location::geometry) AS lat,
  r.photo_public_url, r.status, r.address, r.created_at, r.updated_at,
  cl.category, cl.subcategory, cl.severity, cl.hazard_radius_m,
  cl.visible_size_estimate, cl.is_emergency, cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c ON c.id = r.city_id
WHERE r.status NOT IN ('rejected');
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

CREATE OR REPLACE FUNCTION city_stats(_city_id uuid)
RETURNS TABLE(total bigint, open_count bigint, resolved bigint,
              this_week bigint, prev_week bigint, avg_hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    count(*) FILTER (WHERE r.status <> 'rejected'),
    count(*) FILTER (WHERE r.status IN ('open','dispatched','in_progress')),
    count(*) FILTER (WHERE r.status = 'closed'),
    count(*) FILTER (WHERE r.created_at > now() - interval '7 days'),
    count(*) FILTER (WHERE r.created_at > now() - interval '14 days'
                       AND r.created_at <= now() - interval '7 days'),
    COALESCE(round(avg(EXTRACT(EPOCH FROM (wo.completed_at - r.created_at))/3600.0)
             FILTER (WHERE wo.completed_at IS NOT NULL)::numeric, 1), 0)
  FROM reports r
  LEFT JOIN work_orders wo ON wo.report_id = r.id
  WHERE r.city_id = _city_id;
$$;
GRANT EXECUTE ON FUNCTION city_stats(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION city_category_breakdown(_city_id uuid)
RETURNS TABLE(category classification_category, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cl.category, count(*)
  FROM reports r JOIN classifications cl ON cl.report_id = r.id
  WHERE r.city_id = _city_id AND r.status <> 'rejected'
  GROUP BY cl.category ORDER BY count(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION city_category_breakdown(uuid) TO anon, authenticated;
`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(SQL);
  console.log("dashboard view + RPCs applied OK");
} catch (e) {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

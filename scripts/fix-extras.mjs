// Re-applies the owner-safe parts of migration 003 that rolled back
// (audit trigger fn fix + dashboard view PII strip). Skips storage.objects
// policies (require table ownership unavailable via the pooler postgres role).
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const SQL = `
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    TG_OP, TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id),
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP VIEW IF EXISTS dashboard_reports_view;
CREATE VIEW dashboard_reports_view AS
SELECT r.id, r.city_id, c_city.slug AS city_slug, c_city.name AS city_name,
  r.location, r.photo_public_url, r.status, r.address,
  r.created_at, r.updated_at,
  cl.category, cl.subcategory, cl.severity, cl.hazard_radius_m,
  cl.visible_size_estimate, cl.is_emergency, cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
WHERE r.status NOT IN ('rejected');

GRANT SELECT ON dashboard_reports_view TO anon, authenticated;
`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(SQL);
  console.log("003 owner-safe parts applied OK");
} catch (e) {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

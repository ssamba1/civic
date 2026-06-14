// Focused applier for migration 20260613_012_exclude_merged.sql.
//
// The repo's db:migrate (`supabase db push`) needs the Supabase CLI; this is a
// no-CLI fallback that applies ONLY migration 012 over a direct Postgres
// connection. 012 is idempotent (CREATE OR REPLACE for the RPCs, DROP+CREATE
// for the view), so re-running is safe.
//
// You need the project's direct connection string (NOT the service-role JWT —
// that is a PostgREST key and cannot run DDL). Get it from:
//   Supabase Dashboard → Project Settings → Database → Connection string (URI).
//
// Usage (PowerShell):
//   $env:DATABASE_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
//   node scripts/apply-012.mjs
//
// Usage (bash):
//   DATABASE_URL='postgresql://...' node scripts/apply-012.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL not set. Get the direct Postgres URI from the Supabase\n" +
      "dashboard (Project Settings → Database → Connection string), then:\n" +
      "  $env:DATABASE_URL='postgresql://...'; node scripts/apply-012.mjs",
  );
  process.exit(1);
}

const file = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260613_012_exclude_merged.sql",
);
const sql = readFileSync(file, "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("connected to", url.replace(/:[^:@]+@/, ":****@"));

try {
  await client.query(sql);
  console.log("OK — migration 012 applied (view + RPCs now exclude merged).");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

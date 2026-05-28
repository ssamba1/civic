// One-off migration runner. Reads DATABASE_URL from env (never committed).
// Usage: DATABASE_URL='postgresql://...' node scripts/run-migrations.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("connected to", url.replace(/:[^:@]+@/, ":****@"));

let failures = 0;
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`Applying ${f} ... `);
  try {
    await client.query(sql);
    console.log("OK");
  } catch (e) {
    failures++;
    console.log("FAIL");
    console.error("  " + e.message);
  }
}

await client.end();
console.log(`done (${failures} failed)`);
process.exit(failures > 0 ? 1 : 0);

// Revoke a per-partner Open311 API key (api_keys table, migration 028).
//
//   node scripts/revoke-api-key.mjs --id <uuid>
//   node scripts/revoke-api-key.mjs --label "Forsyth County GIS"
//
// Sets revoked_at = now(). A revoked key stops resolving immediately
// (lookupApiKey filters revoked_at IS NULL). Reversible only via raw SQL.
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const id = arg("id");
const label = arg("label");

if (!id && !label) {
  console.error(
    "Usage: node scripts/revoke-api-key.mjs --id <uuid> | --label \"Partner name\"",
  );
  process.exit(1);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let query = admin
  .from("api_keys")
  .update({ revoked_at: new Date().toISOString() })
  .is("revoked_at", null); // don't re-stamp an already-revoked key
query = id ? query.eq("id", id) : query.eq("label", label);

const { data, error } = await query.select("id, label, revoked_at");

if (error) {
  console.error(`Revoke failed: ${error.message}`);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error("No matching active key found (already revoked, or wrong id/label).");
  process.exit(1);
}
for (const row of data) {
  console.log(`Revoked ${row.id} (${row.label}) at ${row.revoked_at}`);
}

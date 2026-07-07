// Mint a per-partner Open311 API key (api_keys table, migration 028).
//
//   node scripts/issue-api-key.mjs --label "Forsyth County GIS" --user <uuid> [--city <uuid>]
//
// Prints the PLAINTEXT key exactly once — only its SHA-256 hash is stored.
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Revoke later with:  update api_keys set revoked_at = now() where id = '<id>';
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- args ---
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const label = arg("label");
const userId = arg("user");
const cityId = arg("city") ?? null;

if (!label || !userId) {
  console.error(
    'Usage: node scripts/issue-api-key.mjs --label "Partner name" --user <users.id uuid> [--city <cities.id uuid>]',
  );
  process.exit(1);
}

// --- load .env.local (simple parse; values may contain '=') ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// civic_ prefix makes leaked keys grep-able; 32 random bytes of entropy.
const plaintext = `civic_${randomBytes(32).toString("base64url")}`;
const keyHash = createHash("sha256").update(plaintext).digest("hex");

const { data, error } = await admin
  .from("api_keys")
  .insert({ key_hash: keyHash, label, user_id: userId, city_id: cityId })
  .select("id, label, city_id, created_at")
  .single();

if (error) {
  console.error(`Insert failed: ${error.message}`);
  console.error(
    "Is migration 028 applied? Does the --user uuid exist in public.users?",
  );
  process.exit(1);
}

console.log("API key issued. The plaintext below is shown ONCE — store it now.");
console.log("");
console.log(`  id:      ${data.id}`);
console.log(`  label:   ${data.label}`);
console.log(`  city:    ${data.city_id ?? "(unpinned — jurisdiction_id rules apply)"}`);
console.log(`  created: ${data.created_at}`);
console.log("");
console.log(`  KEY: ${plaintext}`);

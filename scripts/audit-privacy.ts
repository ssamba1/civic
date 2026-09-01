/**
 * Privacy audit gate (agents.md Definition of Done: `pnpm audit:privacy`).
 *
 * Cross-references every city's photos-public bucket against photos-raw and
 * flags any file whose size matches its raw counterpart, a strong signal that
 * an unblurred original leaked into the public bucket. Exits non-zero on any
 * violation so CI / a pre-deploy hook can gate on it.
 *
 * Run:  pnpm audit:privacy      (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY;
 *                                auto-loads .env.local if present)
 *
 * Wraps the shared auditPublicBucket() in src/lib/privacy/audit.ts so the audit
 * logic has exactly one implementation (the same one the app can surface).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// tsx does not auto-load dotenv. Mirror scripts/eval-classify.ts.
function loadEnvLocal(): void {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env.local",
    );
    process.exit(1);
  }

  // Imported after env is loaded. CreateServerClient reads it at construction.
  const { createServerClient } = await import("../src/lib/db/client");
  const { auditPublicBucket } = await import("../src/lib/privacy/audit");

  const db = createServerClient();
  const { data: cities, error } = await db.from("cities").select("id, slug");
  if (error) {
    console.error(`Could not list cities: ${error.message}`);
    process.exit(1);
  }

  const allViolations: string[] = [];
  for (const city of (cities ?? []) as { id: string; slug: string }[]) {
    const { violations } = await auditPublicBucket(city.id);
    if (violations.length > 0) {
      allViolations.push(...violations.map((v) => `[${city.slug}] ${v}`));
    }
  }

  if (allViolations.length > 0) {
    console.error(`\n✗ Privacy audit FAILED, ${allViolations.length} finding(s):`);
    for (const v of allViolations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `✓ Privacy audit passed, no raw-photo leaks across ${(cities ?? []).length} city/cities.`,
  );
}

main().catch((err) => {
  console.error("audit-privacy threw:", err);
  process.exit(1);
});

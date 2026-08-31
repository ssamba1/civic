// Stamp reports.public_token for rows that do not have one yet.
//
// Usage: tsx scripts/backfill-public-tokens.ts [--apply]
//        (dry run without --apply)
//
// Why this exists: the token is stamped LAZILY, by status-notify, the first
// time a resident is sent a status link. That is the right behaviour for a live
// city — a report nobody was notified about has no link to leak — but it means
// seeded reports never get one, and /r/[token] is the only entry point to the
// public status page, the share actions, the CSAT rating and the reopen button.
// On a freshly seeded database that whole accountability loop is unreachable:
// every seeded report, zero tokens, every link a 404.
//
// The token is derived by the same publicToken() that status-notify uses, so a
// backfilled row is indistinguishable from a lazily stamped one and a later
// notification for the same report recomputes the identical value.
//
// Idempotent: only touches rows where public_token IS NULL, and re-checks that
// condition on the write so it can never overwrite a live stamp.
//
// NOTE ON THE SALT: tokens are looked up by the stored column, never
// re-derived, so rotating PUBLIC_TOKEN_SALT afterwards does not break existing
// links — it only changes what future stamps look like. Run this AFTER setting
// the production salt if you want production links to match it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { publicToken } from "../src/lib/public-token";

// tsx does not auto-load dotenv, and dotenv is not a dependency here — mirror
// scripts/audit-privacy.ts. Without this the credential guard below reads an
// empty environment and the script exits having done nothing, which is the
// silent-skip failure mode a check like this exists to avoid.
function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
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
loadEnvLocal();

const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — aborting.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function main(): Promise<void> {
  const { data: rows, error } = await db
    .from("reports")
    .select("id")
    .is("public_token", null);

  if (error) {
    console.error("query failed:", error.message);
    process.exit(1);
  }

  const targets = rows ?? [];
  console.log(
    `${targets.length} report(s) without a public_token${
      APPLY ? "" : "  (dry run - pass --apply to write)"
    }`,
  );

  if (!APPLY || targets.length === 0) {
    for (const r of targets.slice(0, 3)) {
      console.log(`  would stamp ${r.id} -> ${publicToken(r.id)}`);
    }
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const r of targets) {
    const { error: upErr } = await db
      .from("reports")
      .update({ public_token: publicToken(r.id) })
      .eq("id", r.id)
      .is("public_token", null);
    if (upErr) {
      failed++;
      console.error(`  FAILED ${r.id}: ${upErr.message}`);
    } else {
      ok++;
    }
  }
  console.log(`stamped ${ok}, failed ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

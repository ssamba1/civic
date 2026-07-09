// One-shot migration-scheme repair. Run manually (owner action):
//   node scripts/apply-pending-and-backfill-ledger.mjs
//
// Does three things, idempotently, against the project in SUPABASE_URL:
//   1. Applies the two migrations verified UNAPPLIED on 2026-07-09:
//        - 20260613_014_bump_priority_rpc.sql  (app already calls this RPC —
//          duplicate-report priority bumps silently fail until applied)
//        - 20260709_039_raw_photo_retention.sql (enables pg_cron + nightly
//          3am job that PERMANENTLY DELETES photos-raw objects older than
//          30 days — that is its purpose per agents.md hard rule #2)
//   2. Backfills supabase_migrations.schema_migrations with rows for every
//      migration that IS applied live but was recorded nowhere (applied via
//      Management API by past sessions). After this, `supabase db push`
//      stops trying to re-run them.
//   3. Verifies: RPC exists, cron job scheduled, ledger row count.
//
// Uses the Management API with SUPABASE_ACCESS_TOKEN from .env.local.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env.local"), "utf8");
const token = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim();
const ref = env.match(/^SUPABASE_URL=https:\/\/([a-z]+)\.supabase\.co/m)?.[1];
if (!token || !ref) throw new Error("SUPABASE_ACCESS_TOKEN / SUPABASE_URL missing from .env.local");

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

// -- 1. apply the two pending migrations ------------------------------------
const pending = [
  "supabase/migrations/20260613_014_bump_priority_rpc.sql",
  "supabase/migrations/20260709_039_raw_photo_retention.sql",
];

const [{ fn_exists }] = await query(
  "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bump_work_order_priority') as fn_exists",
);
const [{ cron_exists }] = await query(
  "select exists(select 1 from pg_extension where extname='pg_cron') as cron_exists",
);

if (!fn_exists) {
  await query(readFileSync(resolve(root, pending[0]), "utf8"));
  console.log("applied 014_bump_priority_rpc");
} else console.log("014 already applied, skipping");

if (!cron_exists) {
  await query(readFileSync(resolve(root, pending[1]), "utf8"));
  console.log("applied 039_raw_photo_retention (nightly 3am raw-photo TTL cleanup now live)");
} else console.log("039 already applied (pg_cron present), skipping");

// -- 2. backfill ledger ------------------------------------------------------
// Every migration verified applied-but-unrecorded on 2026-07-09, plus the two
// applied above. Names match repo filenames (minus .sql) so file<->ledger
// matching is mechanical from here on.
const backfill = [
  "20260527_001_initial_schema",
  "20260527_002_metrics_views",
  "20260527_003_storage_rls_and_fixes",
  "20260527_004_fix_dept_enum",
  "20260527_005_feedback_comments_errors",
  "20260613_010_work_order_cost",
  "20260613_011_dedup_rpc",
  "20260613_012_exclude_merged",
  "20260613_013_work_order_rationale",
  "20260613_014_bump_priority_rpc",
  "20260614_015_under_fix_estimates",
  "20260616_016_report_events",
  "20260616_017_baselines_and_metrics",
  "20260616_018_manual_review_flags",
  "20260618_019_city_onboarding",
  "20260619_020_city_center_rpc",
  "20260630_021_reconcile_live_drift",
  "20260702_022_storage_path_scoping",
  "20260705_023_cost_prediction",
  "20260707_023b_photo_phash",
  "20260707_024_city_config",
  "20260707_025_close_the_loop",
  "20260707_026_team_routing",
  "20260707_027_upvotes_issue_types",
  "20260707_028_api_keys",
  "20260707_029_member_phone",
  "20260707_030_crews",
  "20260708_032b_crew_descriptions",
  "20260709_039_raw_photo_retention",
];

// Version must be unique + sortable; use a fixed base so re-runs are stable.
let inserted = 0;
for (const [i, name] of backfill.entries()) {
  const version = `20260709210${String(i).padStart(3, "0")}`;
  const rows = await query(
    `insert into supabase_migrations.schema_migrations (version, name)
     select '${version}', '${name}'
     where not exists (select 1 from supabase_migrations.schema_migrations where name = '${name}')
     returning version`,
  );
  if (rows?.length) inserted++;
}
console.log(`ledger backfill: ${inserted} rows inserted (${backfill.length - inserted} already present)`);

// -- 3. verify ---------------------------------------------------------------
const [checks] = await query(`select
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bump_work_order_priority') as rpc_014,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cleanup_expired_raw_photos') as fn_039,
  (select count(*) from cron.job where jobname='cleanup-expired-raw-photos') as cron_job,
  (select count(*) from supabase_migrations.schema_migrations) as ledger_rows`);
console.log("verify:", JSON.stringify(checks));
if (!checks.rpc_014 || !checks.fn_039 || !Number(checks.cron_job)) {
  console.error("VERIFICATION FAILED — inspect output above");
  process.exit(1);
}
console.log("done — migration scheme repaired");

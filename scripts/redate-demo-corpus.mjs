// Re-date the Cumming demo corpus so the staff calendar's CURRENT month
// (August 2026) is populated and looks alive.
//
// Why this exists: /city/[slug]/calendar plots work_orders, not reports, and
// lib/db/calendar.ts pre-filters the query on work_orders.created_at with a
// 60-day lookback before bucketing client-side on (dispatched_at ?? created_at).
// So a row only reaches the grid if BOTH work_orders.created_at and its
// calendar timestamp live in the visible window — shifting dispatched_at alone
// is a no-op. Prior art: supabase/seed/july_calendar_backfill.sql (same
// reasoning, targeted July; this supersedes it for the current month).
//
// Before this ran the August grid had 13 chips on 4 days plus 26 stacked on
// Aug 29 — technically non-empty, visually dead. This spreads ~82% of the
// alive corpus across August (weekday-weighted, with a reserved bucket for
// the last few days) and parks the rest in July so prev-month nav isn't blank.
//
// IDEMPOTENT: every target timestamp is derived from an FNV-1a hash of the
// report's UUID plus a fixed ANCHOR constant — never from Date.now() and never
// from the row's current dates. Re-running converges on the identical result
// instead of drifting the corpus further each time.
//
// UPDATE-only: no inserts, no deletes, no schema changes. Scoped to
// cities.slug = 'cumming' and to reports whose status is alive (the calendar
// hides closed/merged/rejected, so re-dating those buys nothing and only risks
// churn). Other cities are never touched.
//
// Usage: node scripts/redate-demo-corpus.mjs [city-slug] [--dry]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
if (!supabaseUrl || !accessToken) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ACCESS_TOKEN in .env.local",
  );
  process.exit(1);
}
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

const slug = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ?? "cumming";
const dryRun = process.argv.includes("--dry");

/** SQL through the Management API — the repo's route for DDL/DML that
 *  PostgREST can't express (see MEMORY: Civic Supabase drift + access). */
async function sql(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

// ── stable, run-independent inputs ─────────────────────────────────────────

// The "now" every derived date is measured against. A constant, not
// Date.now(): the completed-vs-still-open cutoff has to give the same answer
// on every re-run, and the month we are targeting is fixed anyway.
const ANCHOR = Date.UTC(2026, 7, 29, 12, 0, 0); // 2026-08-29T12:00:00Z
const YEAR = 2026;
const MONTH = 7; // 0-based → August
const DAYS_IN_MONTH = 31;

// Reports the calendar refuses to render — left completely alone.
const DEAD_STATUSES = ["closed", "merged", "rejected"];

/** FNV-1a → uint32. Deterministic across runs and machines, which is the
 *  whole idempotency story: dates are a pure function of the report UUID. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Weekday-weighted day pool for August 2026: weekdays get 3 slots, weekends
 *  1, and the future tail (Aug 30–31) 1 — so chips cluster on working days
 *  the way real dispatch does instead of dusting evenly across the grid. */
function buildDayPool() {
  const pool = [];
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const dow = new Date(Date.UTC(YEAR, MONTH, d)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const future = d > 29;
    const weight = future ? 1 : weekend ? 1 : 3;
    for (let w = 0; w < weight; w++) pool.push(d);
  }
  return pool;
}
const DAY_POOL = buildDayPool();
// Same pool clipped to the first 24 days. Rows that carry a completed_at get
// drawn from here so completion (+1–4 days) always lands at or before ANCHOR —
// a row can never be "completed" in the future.
const EARLY_POOL = DAY_POOL.filter((d) => d <= 24);
// Reserved so the last working week is never thin: "recent" surfaces and the
// today-cell would otherwise look abandoned.
const RECENT_DAYS = [25, 26, 27, 28, 29];

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * Target timestamps for one report, derived purely from its id.
 * Coherence rules enforced here:
 *   - open reports get NO dispatched_at (calendar falls back to created_at)
 *   - completed_at only on rows that already had one, always > created_at,
 *     and never after ANCHOR
 *   - work_orders.created_at tracks the report's created_at, so the accessor's
 *     60-day pre-filter can see it
 */
function plan(row) {
  const h = hash(row.id);
  const h2 = hash(`${row.id}:day`);
  const h3 = hash(`${row.id}:hour`);
  const hasCompleted = row.completed_at !== null;
  const isOpen = row.status === "open";

  let year = YEAR;
  let month = MONTH;
  let day;

  if (h % 100 < 18 && !hasCompleted) {
    // ~18% stay in July so the previous month still has content to page back
    // to. Completed rows are excluded from this branch only to keep the
    // August completion density visible.
    month = 6;
    day = 6 + (h2 % 25); // Jul 6..30
  } else if (hasCompleted) {
    day = EARLY_POOL[h2 % EARLY_POOL.length];
  } else if (h % 100 < 33) {
    day = RECENT_DAYS[h2 % RECENT_DAYS.length];
  } else {
    day = DAY_POOL[h2 % DAY_POOL.length];
  }

  const hour = 7 + (h3 % 8); // 07:00–14:00, so same-day offsets never roll over
  const createdMs = Date.UTC(year, month, day, hour, (h3 % 12) * 5);

  const dispatchedMs = isOpen ? null : createdMs + (1 + (h % 4)) * 3600_000;

  let completedMs = null;
  if (hasCompleted && dispatchedMs !== null) {
    const candidate = dispatchedMs + (1 + (h2 % 4)) * 86_400_000;
    // Never completed in the future; such rows simply read as still open.
    completedMs = candidate <= ANCHOR ? candidate : null;
  }

  return {
    id: row.id,
    workOrderId: row.work_order_id,
    createdAt: iso(createdMs),
    dispatchedAt: dispatchedMs === null ? null : iso(dispatchedMs),
    completedAt: completedMs === null ? null : iso(completedMs),
    dueAt:
      row.due_at === null
        ? null
        : iso((dispatchedMs ?? createdMs) + 5 * 86_400_000),
    escalatedAt:
      row.escalated_at === null
        ? null
        : iso((dispatchedMs ?? createdMs) + 3 * 86_400_000),
  };
}

const q = (v) => (v === null ? "NULL" : `'${v}'::timestamptz`);

// ── run ────────────────────────────────────────────────────────────────────

const rows = await sql(`
  select r.id, r.status::text as status,
         w.id as work_order_id, w.completed_at, w.due_at, w.escalated_at
    from public.reports r
    join public.cities c on c.id = r.city_id
    left join public.work_orders w on w.report_id = r.id
   where c.slug = '${slug}'
     and r.status::text not in (${DEAD_STATUSES.map((s) => `'${s}'`).join(",")})
   order by r.id
`);

if (rows.length === 0) {
  console.error(`No alive reports found for city "${slug}".`);
  process.exit(1);
}

const plans = rows.map(plan);
const withWo = plans.filter((p) => p.workOrderId !== null);

const august = plans.filter((p) => p.createdAt.startsWith("2026-08")).length;
console.log(
  `${slug}: ${plans.length} alive reports (${withWo.length} with work orders) → ${august} into August 2026`,
);

if (dryRun) {
  const byDay = {};
  for (const p of withWo) {
    const d = (p.dispatchedAt ?? p.createdAt).slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  console.log(byDay);
}

if (!dryRun) {

const reportValues = plans
  .map((p) => `('${p.id}'::uuid, ${q(p.createdAt)})`)
  .join(",\n    ");

const woValues = withWo
  .map(
    (p) =>
      `('${p.workOrderId}'::uuid, ${q(p.createdAt)}, ${q(p.dispatchedAt)}, ${q(p.completedAt)}, ${q(p.dueAt)}, ${q(p.escalatedAt)})`,
  )
  .join(",\n    ");

await sql(`
begin;

update public.reports r
   set created_at = v.created_at
  from (values
    ${reportValues}
  ) as v(id, created_at)
 where r.id = v.id;

update public.work_orders w
   set created_at    = v.created_at,
       dispatched_at = v.dispatched_at,
       completed_at  = v.completed_at,
       due_at        = v.due_at,
       escalated_at  = v.escalated_at
  from (values
    ${woValues}
  ) as v(id, created_at, dispatched_at, completed_at, due_at, escalated_at)
 where w.id = v.id;

-- Video-detected reports keep their provenance coherent: a cluster (and its
-- decision) must predate the report it spawned, so pull the demo-video
-- clusters back to just before their report's new created_at. Scoped to the
-- seeded demo clusters only.
update public.video_detection_clusters c
   set created_at = r.created_at - interval '90 minutes',
       updated_at = greatest(c.updated_at, r.created_at),
       decided_at = case when c.decided_at is null then null
                         else r.created_at - interval '10 minutes' end
  from public.reports r
  join public.cities ci on ci.id = r.city_id
 where c.report_id = r.id
   and ci.slug = '${slug}'
   and c.decision_dossier->>'seed' = 'demo-video-clusters';

commit;
`);

console.log("Applied. Verifying…");

const perDay = await sql(`
  select coalesce(w.dispatched_at, w.created_at)::date as d, count(*) as n
    from public.work_orders w
    join public.reports r on r.id = w.report_id
    join public.cities c on c.id = r.city_id
   where c.slug = '${slug}'
     and r.status::text not in (${DEAD_STATUSES.map((s) => `'${s}'`).join(",")})
     and coalesce(w.dispatched_at, w.created_at) >= '2026-08-01'
     and coalesce(w.dispatched_at, w.created_at) <  '2026-09-01'
   group by 1 order by 1
`);
console.log(
  `August days populated: ${perDay.length}, chips: ${perDay.reduce((s, r) => s + Number(r.n), 0)}, max/day: ${Math.max(...perDay.map((r) => Number(r.n)))}`,
);

const bad = await sql(`
  select
    count(*) filter (where w.completed_at < w.created_at)              as completed_before_created,
    count(*) filter (where w.completed_at is not null
                       and r.status::text = 'open')                    as open_but_completed,
    count(*) filter (where w.dispatched_at < w.created_at)             as dispatched_before_created,
    count(*) filter (where w.completed_at > '2026-08-29T12:00:00Z')    as completed_in_future,
    count(*) filter (where w.created_at < r.created_at)                as wo_before_report
    from public.work_orders w
    join public.reports r on r.id = w.report_id
    join public.cities c on c.id = r.city_id
   where c.slug = '${slug}'
`);
console.log("Contradictions:", bad[0]);
}

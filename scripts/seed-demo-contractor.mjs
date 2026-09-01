// Seed the Northside Paving LLC contractor story behind the pothole
// camera-demo: the vendor row, the completed capital job on Peachtree
// Industrial Blvd, its live 24-month warranty, and the matching crew, then
// backfill the already-seeded demo pothole report with a work order routed to
// that crew and a contractor_warranty liability verdict.
//
// Everything cites contract PW-2025-041, the same reference the Documents
// workspace corpus uses (scripts/seed-city-documents.mjs), so the report
// detail, the liability badge, and document retrieval all tell one story.
//
// The capital job's footprint runs exactly through the demo pothole location
// (-84.14, 34.21, CENTER in scripts/seed-demo-video-reports.mjs), inside the
// evaluator's 15 m MATCH_TOLERANCE_M, and the warranty window (2026-06-01 →
// 2028-06-01) brackets any report created while the demo is current. Live
// video dispatches (src/lib/video/decide.ts) now evaluate liability
// themselves; this script covers the canned reports seeded before that.
//
// Idempotent: contractor keyed on email, capital job on (city, contract_ref),
// warranty on its capital job, crew on (city, team_key, name), work order on
// report_id, liability on its report_id PK.
//
// Requires migrations 030 (crews), 053 (contractors), 062 (liability).
// Usage: node scripts/seed-demo-contractor.mjs [city-slug]   (default: cumming)

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const slug = process.argv[2] ?? "cumming";

const VENDOR_NAME = "Northside Paving LLC";
const VENDOR_EMAIL = "dispatch@northsidepaving.example";
const CONTRACT_REF = "PW-2025-041";
// Overlay along Peachtree Industrial Blvd passing exactly through the demo
// pothole point, so ST_DWithin matches at distance 0.
const FOOTPRINT =
  "SRID=4326;LINESTRING(-84.1445 34.2065, -84.14 34.21, -84.1355 34.2135)";
const COMPLETED_AT = "2026-05-15";
const WARRANTY_STARTS = "2026-06-01"; // final acceptance
const WARRANTY_ENDS = "2028-06-01";
// Evaluator formula (src/lib/liability/evaluate.ts): 0.5·distance(0 m → 1)
// + 0.3·compat(pothole/resurfacing → 1) + 0.2·source(manual → 0.5) = 0.9.
const CONFIDENCE = 0.9;

const CREW = {
  team_key: "streets_roads",
  name: VENDOR_NAME,
  crew_type: "paving",
  description:
    "Contract pothole repair vendor under resurfacing agreement PW-2025-041. All pothole and pavement-failure work on the arterial corridors, Peachtree Industrial Blvd, Buford Hwy, Canton Hwy, Atlanta Road, routes here; repairs on those roads are covered by the vendor's 24-month warranty at no cost to the City.",
};

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(method, path, body, extraHeaders = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok)
    throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── city ───────────────────────────────────────────────────────────────────
const [city] = await rest("GET", `cities?slug=eq.${slug}&select=id,name`);
if (!city) {
  console.error(`No cities row for slug "${slug}"`);
  process.exit(1);
}

// ── contractor ─────────────────────────────────────────────────────────────
let [contractor] = await rest(
  "GET",
  `contractors?email=eq.${encodeURIComponent(VENDOR_EMAIL)}&select=id,name`,
);
if (!contractor) {
  [contractor] = await rest("POST", "contractors", {
    city_id: city.id,
    name: VENDOR_NAME,
    email: VENDOR_EMAIL,
    active: true,
  });
  console.log(`contractor created: ${VENDOR_NAME}`);
} else {
  console.log(`contractor exists: ${contractor.name}`);
}

// ── capital job + warranty ─────────────────────────────────────────────────
let [job] = await rest(
  "GET",
  `capital_jobs?city_id=eq.${city.id}&contract_ref=eq.${CONTRACT_REF}&select=id`,
);
if (!job) {
  [job] = await rest("POST", "capital_jobs", {
    city_id: city.id,
    contractor_id: contractor.id,
    contract_ref: CONTRACT_REF,
    job_type: "resurfacing",
    description:
      "Peachtree Industrial Blvd resurfacing, Market Place Blvd to Bald Ridge Marina Rd (Work Package 7): mill + 1.5in hot-mix overlay, 41 full-depth patches.",
    footprint: FOOTPRINT,
    completed_at: COMPLETED_AT,
    contract_value_cents: 89100000,
    source: "manual",
  });
  console.log(`capital job created: ${CONTRACT_REF}`);
} else {
  // Re-run picks up edits to the geometry/vendor link.
  await rest("PATCH", `capital_jobs?id=eq.${job.id}`, {
    contractor_id: contractor.id,
    footprint: FOOTPRINT,
    completed_at: COMPLETED_AT,
  });
  console.log(`capital job exists: ${CONTRACT_REF} (refreshed)`);
}

let [warranty] = await rest(
  "GET",
  `warranties?capital_job_id=eq.${job.id}&select=id`,
);
if (!warranty) {
  [warranty] = await rest("POST", "warranties", {
    capital_job_id: job.id,
    warranty_type: "pavement_performance",
    starts_on: WARRANTY_STARTS,
    ends_on: WARRANTY_ENDS,
    covers_categories: ["pothole"],
    bond_ref: "MB-88412",
    bond_value_cents: 89100000,
    notes:
      "24-month pavement performance warranty from final acceptance per §4 of PW-2025-041; secured by maintenance bond MB-88412.",
  });
  console.log("warranty created: 2026-06-01 → 2028-06-01");
} else {
  await rest("PATCH", `warranties?id=eq.${warranty.id}`, {
    starts_on: WARRANTY_STARTS,
    ends_on: WARRANTY_ENDS,
    covers_categories: ["pothole"],
  });
  console.log("warranty exists (window refreshed)");
}

// ── crew (same row supabase/seed/demo-crews.mjs maintains) ─────────────────
let [crew] = await rest(
  "GET",
  `crews?city_id=eq.${city.id}&team_key=eq.${CREW.team_key}&name=eq.${encodeURIComponent(CREW.name)}&select=id`,
);
if (!crew) {
  [crew] = await rest("POST", "crews", {
    city_id: city.id,
    team_key: CREW.team_key,
    name: CREW.name,
    crew_type: CREW.crew_type,
    active: true,
    description: CREW.description,
  });
  console.log(`crew created: ${CREW.name}`);
} else {
  console.log(`crew exists: ${CREW.name}`);
}

// ── backfill the canned demo pothole report ────────────────────────────────
// seed-demo-video-reports.mjs creates the report + classification but no work
// order and no liability row; find it via its classification.
const reports = await rest(
  "GET",
  `reports?city_id=eq.${city.id}&tags=cs.{video-detection}&select=id,status,classifications(category)`,
);
const potholeReports = (reports ?? []).filter((r) => {
  const c = r.classifications;
  const cat = Array.isArray(c) ? c[0]?.category : c?.category;
  return cat === "pothole";
});
if (potholeReports.length === 0) {
  console.log(
    "no canned video-detection pothole report found. Run scripts/seed-demo-video-reports.mjs first (live dispatches handle themselves).",
  );
}

for (const report of potholeReports) {
  const [wo] = await rest(
    "GET",
    `work_orders?report_id=eq.${report.id}&select=id,assigned_crew_id`,
  );
  if (!wo) {
    await rest("POST", "work_orders", {
      report_id: report.id,
      department: "public_works",
      team_key: CREW.team_key,
      crew_type: CREW.crew_type,
      priority_score: 82,
      est_minutes: 90,
      assigned_crew_id: crew.id,
      dispatched_at: new Date().toISOString(),
    });
    console.log(`work order created for report ${report.id} → ${CREW.name}`);
  } else if (!wo.assigned_crew_id) {
    await rest("PATCH", `work_orders?id=eq.${wo.id}`, {
      assigned_crew_id: crew.id,
    });
    console.log(`work order ${wo.id} assigned → ${CREW.name}`);
  } else {
    console.log(`work order ${wo.id} already assigned, left alone`);
  }

  // Upsert on the report_id PK: same shape evaluateReportLiability writes.
  await rest(
    "POST",
    "report_liability",
    {
      report_id: report.id,
      verdict: "contractor_warranty",
      capital_job_id: job.id,
      warranty_id: warranty.id,
      utility_permit_id: null,
      liable_contractor_id: contractor.id,
      window_ends_on: WARRANTY_ENDS,
      match_distance_m: 0,
      confidence: CONFIDENCE,
      is_stale: false,
    },
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
  console.log(`liability verdict: contractor_warranty for report ${report.id}`);

  if (report.status === "open") {
    await rest("PATCH", `reports?id=eq.${report.id}`, {
      status: "dispatched",
    });
    console.log(`report ${report.id} status open → dispatched`);
  }
}

console.log(`DONE for ${city.name} (${slug}).`);

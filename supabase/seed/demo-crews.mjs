/**
 * Civic, Demo crews seed (idempotent).
 *
 * Provisions crews + rosters for the demo cities directly in the live
 * Supabase project via the service-role key (data plane only, schema must
 * already exist; run migrations first, including 20260707_030_crews.sql):
 *   - 8-crew roster per demo city (skips any crew whose team_key division
 *     isn't enabled for that city)
 *   - round-robin staffing from existing staff/admin users (first member per
 *     crew becomes lead)
 *   - back-fills assigned_crew_id + dispatched_at on existing NULL work
 *     orders so the staff calendar has something to show
 *
 * Tolerates crews.description not existing yet (migration 20260708_032):
 * retries the upsert without it and warns once.
 *
 * Run from the project root:  node supabase/seed/demo-crews.mjs
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from env or ./.env.local).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// env: prefer process.env, fall back to ./.env.local
const env = { ...process.env };
try {
  for (const l of readFileSync("./.env.local", "utf8").split(/\r?\n/)) {
    if (l && !l.startsWith("#") && l.includes("=")) {
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      if (!env[k]) env[k] = l.slice(i + 1).trim();
    }
  }
} catch {}
const SB_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SVC) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (env or .env.local).");
  process.exit(1);
}
const db = createClient(SB_URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

const CITY_SLUGS = ["cumming", "ahilyanagar"];
const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"];

// Two same-type crews on streets_roads are deliberate, showcases the AI
// crew_hint routing (descriptions differentiate them) and the load balancer
// in src/lib/ai/crew-assign.ts when the hint misses.
//
// MUST stay in sync with CREW_UNIT_ROSTER in src/lib/demo-auth.ts, same
// names/crew_type values, so each per-crew demo login's ?crew=<name> scope
// resolves against a real seeded row instead of silently falling back to
// the type-level portal.
const CREW_ROSTER = [
  { name: "Northside Paving LLC", team_key: "streets_roads", crew_type: "paving", description: "Contract pothole repair vendor under resurfacing agreement PW-2025-041. All pothole and pavement-failure work on the arterial corridors, Peachtree Industrial Blvd, Buford Hwy, Canton Hwy, Atlanta Road, routes here; repairs on those roads are covered by the vendor's 24-month warranty at no cost to the City." },
  { name: "North Paving Crew", team_key: "streets_roads", crew_type: "paving", description: "City crew, school zones and everything north of the city core, fast pothole patch turnarounds on residential streets." },
  { name: "South Paving Crew", team_key: "streets_roads", crew_type: "paving", description: "Downtown, the parks district, and southern subdivisions, larger resurfacing and prep jobs." },
  { name: "Flatwork Crew", team_key: "sidewalks_ada", crew_type: "concrete", description: "Sidewalk panel replacement, curb ramps, and ADA compliance fixes citywide." },
  { name: "Storm Drain Crew", team_key: "stormwater", crew_type: "drain_crew", description: "Clogged inlets, culverts, jet-truck cleanouts, and standing-water calls." },
  { name: "Night Line Crew", team_key: "street_lighting", crew_type: "line_crew", description: "Streetlight outages, downed lines, and powered signal faults, after-hours capable." },
  { name: "Signal & Sign Crew", team_key: "traffic_engineering", crew_type: "sign_crew", description: "Downed stop signs, faded signage, and signal head replacements." },
  { name: "Forestry Crew", team_key: "parks_forestry", crew_type: "arborist", description: "Fallen trees, hazardous limb removal, and post-storm cleanup across parks and rights-of-way." },
  { name: "Beautification Crew", team_key: "graffiti_abatement", crew_type: "cleanup", description: "Graffiti removal, illegal dump pickups, and community cleanup sweeps." },
];

const DAY_MS = 24 * 3600 * 1000;

const log = (...a) => console.log(...a);
async function ok(p, label) { const { data, error } = await p; if (error) { console.error(`FAIL [${label}]:`, error.message); process.exit(1); } return data; }

// crews.description may not exist yet (migration 032 not applied). Try the
// upsert with it; on a missing-column error, strip it and retry once, warning
// the operator to apply 032. Everything else fails loud like ok().
let descriptionMissingWarned = false;
async function upsertCrews(cityId, rows) {
  const withDesc = rows.map((r) => ({
    city_id: cityId,
    team_key: r.team_key,
    name: r.name,
    crew_type: r.crew_type,
    active: true,
    description: r.description,
  }));
  let { data, error } = await db
    .from("crews")
    .upsert(withDesc, { onConflict: "city_id,team_key,name", ignoreDuplicates: false })
    .select("id, team_key, name, crew_type");

  const missingDescCol = error && (error.code === "42703" || /description.*does not exist/i.test(error.message ?? ""));
  if (missingDescCol) {
    if (!descriptionMissingWarned) {
      log("  WARNING: crews.description column not found, apply supabase/migrations/20260708_032_crew_descriptions.sql to store crew descriptions. Seeding without descriptions for now.");
      descriptionMissingWarned = true;
    }
    const noDesc = withDesc.map(({ description, ...rest }) => rest);
    ({ data, error } = await db
      .from("crews")
      .upsert(noDesc, { onConflict: "city_id,team_key,name", ignoreDuplicates: false })
      .select("id, team_key, name, crew_type"));
  }
  if (error) { console.error("FAIL [crews upsert]:", error.message); process.exit(1); }
  return data ?? [];
}

async function seedCity(slug) {
  log(`\n=== ${slug} ===`);
  const city = await ok(db.from("cities").select("id, name").eq("slug", slug).maybeSingle(), `city lookup ${slug}`);
  if (!city) { log(`skip: no city row for slug "${slug}"`); return; }
  const cityId = city.id;
  log(`city: ${city.name} (${cityId})`);

  // Only seed a crew whose division (team_key) is enabled for this city.
  // Crews.team_key has no FK to city_teams, so an insert would silently
  // succeed for a disabled/absent division and the UI would show a crew
  // under a division the city turned off.
  const teamRows = await ok(db.from("city_teams").select("team_key, enabled").eq("city_id", cityId), `city_teams lookup ${slug}`);
  // A city with ZERO city_teams rows runs on the app's preset divisions
  // (the UI falls back to TEAM_LIST, Cumming is in this state), so an empty
  // table means "everything enabled", not "nothing enabled".
  const hasTeamConfig = (teamRows ?? []).length > 0;
  const enabledTeamKeys = new Set((teamRows ?? []).filter((t) => t.enabled).map((t) => t.team_key));
  const teamEnabled = (key) => !hasTeamConfig || enabledTeamKeys.has(key);

  const toSeed = CREW_ROSTER.filter((c) => teamEnabled(c.team_key));
  for (const c of CREW_ROSTER) {
    if (!teamEnabled(c.team_key)) log(`  skip crew "${c.name}", team_key "${c.team_key}" not enabled for this city`);
  }

  const crews = toSeed.length ? await upsertCrews(cityId, toSeed) : [];
  log(`crews: ${crews.length} upserted`);

  // --- staff the crews (round-robin; first member per crew becomes lead) ---
  const staff = await ok(
    db.from("users").select("id, display_name").eq("city_id", cityId).in("role", STAFF_ROLES).order("id"),
    `staff lookup ${slug}`,
  );
  let membersLinked = 0;
  if (!crews.length) {
    log(`members: 0 linked (no crews to staff)`);
  } else if (!staff?.length) {
    log(`members: 0 linked (no staff/admin users in this city, hollow crews, assignable by design)`);
  } else {
    const memberRows = staff.map((u, i) => ({
      crew_id: crews[i % crews.length].id,
      user_id: u.id,
      is_lead: i < crews.length, // first pass through the crew list = first member on each crew
    }));
    await ok(
      db.from("crew_members").upsert(memberRows, { onConflict: "crew_id,user_id", ignoreDuplicates: true }),
      `crew_members upsert ${slug}`,
    );
    membersLinked = memberRows.length;
    log(`members: ${membersLinked} linked across ${crews.length} crews`);
  }

  // --- calendar visibility: assign unassigned work orders + stamp dispatch ---
  // work_orders has no city_id; scope through reports!inner(city_id), same
  // join pattern as src/lib/db/calendar.ts and src/lib/ai/crew-assign.ts.
  const crewsByKey = new Map(); // "team_key::crew_type" -> crews[] (name-sorted for stable round robin)
  for (const c of crews) {
    const key = `${c.team_key}::${c.crew_type}`;
    if (!crewsByKey.has(key)) crewsByKey.set(key, []);
    crewsByKey.get(key).push(c);
  }
  for (const arr of crewsByKey.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  const pickCounters = new Map(); // key -> next index, for deterministic round robin across duplicate-type crews

  let assigned = 0;
  if (crewsByKey.size) {
    const unassigned = await ok(
      db
        .from("work_orders")
        .select("id, team_key, crew_type, assigned_crew_id, reports!inner(city_id)")
        .eq("reports.city_id", cityId)
        .is("assigned_crew_id", null)
        .order("id"),
      `unassigned work_orders lookup ${slug}`,
    );
    for (const wo of unassigned ?? []) {
      if (!wo.team_key || !wo.crew_type) continue;
      const key = `${wo.team_key}::${wo.crew_type}`;
      const candidates = crewsByKey.get(key);
      if (!candidates?.length) continue;
      const idx = pickCounters.get(key) ?? 0;
      pickCounters.set(key, idx + 1);
      const crew = candidates[idx % candidates.length];
      await ok(
        db.from("work_orders").update({ assigned_crew_id: crew.id }).eq("id", wo.id).is("assigned_crew_id", null),
        `work_order assign ${wo.id}`,
      );
      assigned++;
    }
  }
  log(`work_orders: ${assigned} assigned to a crew`);

  const undispatched = await ok(
    db
      .from("work_orders")
      .select("id, dispatched_at, completed_at, reports!inner(city_id)")
      .eq("reports.city_id", cityId)
      .is("dispatched_at", null)
      .is("completed_at", null)
      .order("id"),
    `undispatched work_orders lookup ${slug}`,
  );
  let stamped = 0;
  const now = Date.now();
  for (const [i, wo] of (undispatched ?? []).entries()) {
    const daysAgo = (i * 37) % 21;
    const hour = 9 + (i % 8);
    const d = new Date(now - daysAgo * DAY_MS);
    d.setUTCHours(hour, 0, 0, 0);
    await ok(
      db.from("work_orders").update({ dispatched_at: d.toISOString() }).eq("id", wo.id).is("dispatched_at", null),
      `work_order dispatch-stamp ${wo.id}`,
    );
    stamped++;
  }
  log(`work_orders: ${stamped} dispatched_at stamped`);

  log(`SUMMARY ${slug}: crews=${crews.length} members=${membersLinked} assigned=${assigned} stamped=${stamped}`);
}

async function main() {
  log(`\n=== Demo crews seed -> ${new URL(SB_URL).host} ===`);
  for (const slug of CITY_SLUGS) await seedCity(slug);
  log(`\nDONE.`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

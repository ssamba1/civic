/**
 * Civic – Ahilyanagar demo seed (idempotent).
 *
 * Provisions the Ahilyanagar, Maharashtra demo city directly in the live
 * Supabase project via the service-role key (data plane only — schema must
 * already exist; run migrations first):
 *   - cities row (slug `ahilyanagar`, geocoded center)
 *   - 11 city_teams rows (full category -> team routing)
 *   - demo admin + resident auth accounts (passwords printed; reset on re-run)
 *   - ~22 seed reports + classifications (+ work_orders for non-open), tagged
 *     classifications.model_version = 'ahilyanagar-seed-v1' for a one-line reset
 *
 * Run from the project root:  node supabase/seed/ahilyanagar-demo.mjs
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from env or ./.env.local).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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

const SLUG = "ahilyanagar";
const NAME = "Ahilyanagar";
const STATE = "Maharashtra";
const CENTER = { lat: 19.0948, lng: 74.748 }; // Ahilyanagar (formerly Ahmednagar) city center
const SEED_MV = "ahilyanagar-seed-v1";
const wkt = (lng, lat) => `SRID=4326;POINT(${lng} ${lat})`;
const genPw = () => randomBytes(9).toString("base64url");

const CAT = {
  pothole:        { team: "streets_roads",          label: "Streets & Roads Division",                      dept: "public_works",     crew: "paving",     min: 30,  mats: ["cold patch", "tamper"] },
  sidewalk_damage:{ team: "sidewalks_ada",          label: "Sidewalk & ADA Compliance Division",            dept: "public_works",     crew: "concrete",   min: 240, mats: ["concrete mix", "forms"] },
  drainage:       { team: "stormwater",             label: "Stormwater / Drainage Division",                dept: "public_works",     crew: "drain_crew", min: 90,  mats: ["jet truck"] },
  water_leak:     { team: "water_utilities",        label: "Water & Utilities Division",                    dept: "utilities",        crew: "line_crew",  min: 120, mats: ["varies by severity"] },
  streetlight:    { team: "street_lighting",        label: "Street Lighting Division",                      dept: "utilities",        crew: "line_crew",  min: 60,  mats: ["bulb", "fuse", "lift truck"] },
  downed_sign:    { team: "traffic_engineering",    label: "Traffic Engineering & Signals Division",        dept: "public_works",     crew: "sign_crew",  min: 20,  mats: ["post", "bolts"] },
  faded_signage:  { team: "traffic_engineering",    label: "Traffic Engineering & Signals Division",        dept: "public_works",     crew: "sign_crew",  min: 25,  mats: ["replacement sign"] },
  tree_down:      { team: "parks_forestry",         label: "Parks & Recreation / Urban Forestry",           dept: "parks",            crew: "arborist",   min: 90,  mats: ["chainsaw", "chipper"] },
  graffiti:       { team: "graffiti_abatement",     label: "Graffiti Abatement / Community Beautification", dept: "parks",            crew: "cleanup",    min: 40,  mats: ["solvent", "pressure washer"] },
  illegal_dump:   { team: "code_enforcement",       label: "Code Enforcement Division",                     dept: "code_enforcement", crew: "cleanup",    min: 45,  mats: ["truck", "gloves"] },
  debris:         { team: "environmental_services", label: "Environmental Services / Solid Waste",          dept: "sanitation",       crew: "cleanup",    min: 20,  mats: ["truck"] },
  other:          { team: "general_admin",          label: "General Administration / 311 Triage",           dept: "other",            crew: null,         min: 0,   mats: [] },
};

const ADDR = ["Station Road", "Delhi Gate", "Savedi Road", "Market Yard", "Kapad Bazar", "Nagar-Pune Road", "Maliwada", "Sarjepura", "Bhingar Camp", "Kedgaon", "Tilak Road", "Professor Colony", "MIDC Nagapur", "Chitale Road", "Gulmohar Road", "Wadia Park", "Tophkhana", "Zenda Igat"];

const SEEDS = [
  ["pothole", 4, "open"], ["pothole", 3, "dispatched"], ["streetlight", 2, "open"], ["streetlight", 3, "in_progress"],
  ["drainage", 5, "dispatched"], ["drainage", 4, "open"], ["water_leak", 5, "in_progress"], ["water_leak", 3, "closed"],
  ["tree_down", 4, "dispatched"], ["tree_down", 2, "closed"], ["graffiti", 2, "open"], ["illegal_dump", 3, "open"],
  ["illegal_dump", 4, "dispatched"], ["debris", 2, "closed"], ["debris", 3, "open"], ["sidewalk_damage", 3, "open"],
  ["downed_sign", 3, "open"], ["faded_signage", 1, "closed"], ["pothole", 5, "open"], ["streetlight", 2, "closed"],
  ["drainage", 3, "open"], ["other", 2, "open"],
];

const log = (...a) => console.log(...a);
async function ok(p, label) { const { data, error } = await p; if (error) { console.error(`FAIL [${label}]:`, error.message); process.exit(1); } return data; }

async function ensureUser(email, role) {
  const pw = genPw();
  const { data, error } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (!error) return { id: data.user.id, email, pw, role, existed: false };
  if (!/already|registered|exists/i.test(error.message)) { console.error(`FAIL createUser ${email}:`, error.message); process.exit(1); }
  let page = 1, found = null;
  while (!found && page <= 20) {
    const { data: lu } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    found = lu?.users?.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!lu || lu.users.length < 1000) break;
    page++;
  }
  if (!found) { console.error(`FAIL: ${email} exists but not found`); process.exit(1); }
  await db.auth.admin.updateUserById(found.id, { password: pw });
  return { id: found.id, email, pw, role, existed: true };
}

async function main() {
  log(`\n=== Ahilyanagar civic seed -> ${new URL(SB_URL).host} ===\n`);

  const existingCity = await ok(db.from("cities").select("id").eq("slug", SLUG).maybeSingle(), "city lookup");
  let cityId;
  if (existingCity) {
    cityId = existingCity.id;
    await ok(db.from("cities").update({ name: NAME, state: STATE, active: true, center: wkt(CENTER.lng, CENTER.lat) }).eq("id", cityId), "city update");
    log(`city: updated ${SLUG} (${cityId})`);
  } else {
    const c = await ok(db.from("cities").insert({ slug: SLUG, name: NAME, state: STATE, active: true, center: wkt(CENTER.lng, CENTER.lat) }).select("id").single(), "city insert");
    cityId = c.id;
    log(`city: created ${SLUG} (${cityId})`);
  }

  const teamCats = {};
  for (const [cat, m] of Object.entries(CAT)) (teamCats[m.team] ??= { label: m.label, cats: [] }).cats.push(cat);
  const teamRows = Object.entries(teamCats).map(([team_key, v]) => ({ city_id: cityId, team_key, label: v.label, enabled: true, categories: v.cats }));
  await ok(db.from("city_teams").upsert(teamRows, { onConflict: "city_id,team_key" }), "city_teams upsert");
  log(`city_teams: ${teamRows.length} teams routed`);

  const admin = await ensureUser("admin@ahilyanagar.civic.demo", "admin");
  const resident = await ensureUser("resident@ahilyanagar.civic.demo", "resident");
  for (const u of [admin, resident]) {
    await ok(db.from("users").upsert({ id: u.id, city_id: cityId, role: u.role, email: u.email, display_name: u.role === "admin" ? "Ahilyanagar Admin" : "Ahilyanagar Resident" }, { onConflict: "id" }), `users upsert ${u.email}`);
  }
  log(`accounts: admin + resident ready`);

  const priorCls = await ok(db.from("classifications").select("report_id").eq("model_version", SEED_MV), "prior seed lookup");
  const priorIds = (priorCls || []).map((r) => r.report_id);
  if (priorIds.length) {
    await ok(db.from("reports").delete().in("id", priorIds), "prior seed delete");
    log(`reset: removed ${priorIds.length} prior seed reports`);
  }

  const now = Date.now();
  let n = 0;
  for (const [cat, sev, status] of SEEDS) {
    const jLat = CENTER.lat + Math.sin(n * 2.3) * 0.022;
    const jLng = CENTER.lng + Math.cos(n * 1.7) * 0.026;
    const createdAt = new Date(now - (n * 7 + 3) * 3600 * 1000).toISOString();
    const rep = await ok(db.from("reports").insert({
      city_id: cityId, reporter_id: resident.id, location: wkt(jLng, jLat),
      photo_public_url: `https://picsum.photos/seed/ahilyanagar-${cat}-${n}/640/360`,
      status, address: `${ADDR[n % ADDR.length]}, Ahilyanagar`, description: null, created_at: createdAt,
    }).select("id").single(), `report insert #${n}`);

    await ok(db.from("classifications").insert({
      report_id: rep.id, category: cat, severity: sev,
      is_emergency: sev >= 5 && (cat === "water_leak" || cat === "drainage"),
      confidence: 0.82 + (n % 5) * 0.03, model_version: SEED_MV,
      reasoning: `Seed: ${cat} reported near ${ADDR[n % ADDR.length]}.`,
    }), `classification insert #${n}`);

    if (status !== "open") {
      const m = CAT[cat];
      await ok(db.from("work_orders").insert({
        report_id: rep.id, department: m.dept, crew_type: m.crew,
        priority_score: sev * 2 + (cat === "water_leak" ? 6 : 3), est_minutes: m.min, materials: m.mats,
        dispatched_at: createdAt, completed_at: status === "closed" ? new Date(now - n * 3600 * 1000).toISOString() : null,
      }), `work_order insert #${n}`);
    }
    n++;
  }
  log(`reports: seeded ${n}`);

  const verify = await ok(db.from("dashboard_reports_view").select("id").eq("city_slug", SLUG), "dashboard view count");
  log(`\nVERIFY: dashboard_reports_view rows for ${SLUG} = ${verify.length}`);
  log(`\n=== CREDENTIALS (demo) ===`);
  log(`Admin    : ${admin.email}  /  ${admin.pw}`);
  log(`Resident : ${resident.email}  /  ${resident.pw}`);
  log(`\nDONE.`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

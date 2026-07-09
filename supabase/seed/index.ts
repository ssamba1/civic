/**
 * Civic – Seed Data
 *
 * Seeds:
 *  - Cumming, GA as a city with approximate boundary polygon
 *  - 3 test users: 1 resident, 1 staff_dispatcher, 1 admin
 *  - 5 sample reports with classifications and work orders
 *
 * Run via: npx tsx supabase/seed/index.ts [--dry-run]
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * Idempotent: city + users upsert on conflict; reports are skipped when one
 * with the same (city, address) already exists, so re-running never duplicates
 * the sample corpus. --dry-run prints the plan and writes nothing.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.\n" +
      "Export them before running the seed.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Generate random passwords at runtime — never embed as string literals
// ---------------------------------------------------------------------------

function generatePassword(): string {
  return randomBytes(16).toString("hex"); // 32-char hex password
}

const passwords = {
  resident: generatePassword(),
  staff_dispatcher: generatePassword(),
  admin: generatePassword(),
};

console.log("Generated seed passwords (save these):");
console.log(JSON.stringify(passwords, null, 2));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pointWKT(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

async function assertOk<T>(
  promise: PromiseLike<{ data: T | null; error: unknown }>,
  label: string,
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error || data == null) {
    console.error(`SEED FAILED at [${label}]:`, error ?? "no data returned");
    process.exit(1);
  }
  return data as NonNullable<T>;
}

// ---------------------------------------------------------------------------
// 1. Seed city: Cumming, Georgia
// ---------------------------------------------------------------------------

// Approximate bounding polygon for Cumming, GA city limits
const cummingBoundaryWKT = `SRID=4326;POLYGON((
  -84.16 34.18,
  -84.10 34.18,
  -84.10 34.24,
  -84.16 34.24,
  -84.16 34.18
))`;

async function seedCity(): Promise<string> {
  const [city] = await assertOk(
    supabase
      .from("cities")
      .upsert(
        {
          slug: "cumming",
          name: "Cumming",
          state: "GA",
          boundary: cummingBoundaryWKT,
          open311_jurisdiction_id: "cumming.ga.gov",
          active: true,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .limit(1),
    "cities.upsert",
  );
  console.log(`City seeded: ${city.id}`);
  return city.id;
}

// ---------------------------------------------------------------------------
// 2. Seed auth users + public.users rows
// ---------------------------------------------------------------------------

interface TestUser {
  email: string;
  password: string;
  role: "resident" | "staff_dispatcher" | "admin";
  displayName: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: "resident@civic-test.local",
    password: passwords.resident,
    role: "resident",
    displayName: "Jane Doe",
  },
  {
    email: "dispatcher@civic-test.local",
    password: passwords.staff_dispatcher,
    role: "staff_dispatcher",
    displayName: "Marcus Chen",
  },
  {
    email: "admin@civic-test.local",
    password: passwords.admin,
    role: "admin",
    displayName: "Sarah Park",
  },
];

async function seedUsers(cityId: string): Promise<Record<string, string>> {
  const userIds: Record<string, string> = {};

  for (const u of TEST_USERS) {
    // Create auth user (idempotent-ish — will error if exists, so we catch)
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });

    let userId: string;

    if (authError) {
      // User may already exist — try to look them up
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find(
        (existing) => existing.email === u.email,
      );
      if (!existing) {
        console.error(`Cannot create or find auth user ${u.email}:`, authError);
        process.exit(1);
      }
      userId = existing.id;
    } else {
      userId = authData.user.id;
    }

    // Upsert public.users row
    await assertOk(
      supabase
        .from("users")
        .upsert(
          {
            id: userId,
            city_id: cityId,
            role: u.role,
            email: u.email,
            display_name: u.displayName,
          },
          { onConflict: "id" },
        )
        .select("id"),
      `users.upsert(${u.email})`,
    );

    userIds[u.role] = userId;
    console.log(`User seeded: ${u.displayName} (${u.role}) — ${userId}`);
  }

  return userIds;
}

// ---------------------------------------------------------------------------
// 3. Seed reports, classifications, work orders
// ---------------------------------------------------------------------------

interface SeedReport {
  location: { lng: number; lat: number };
  photoPublicUrl: string;
  status: string;
  address: string;
  description: string;
  classification: {
    category: string;
    subcategory: string;
    severity: number;
    hazardRadiusM: number;
    visibleSizeEstimate: string;
    isEmergency: boolean;
    confidence: number;
    reasoning: string;
  };
  workOrder: {
    department: string;
    crewType: string;
    priorityScore: number;
    estMinutes: number;
    materials: unknown[];
  };
}

const SEED_REPORTS: SeedReport[] = [
  {
    location: { lng: -84.1384, lat: 34.2073 },
    photoPublicUrl: "https://picsum.photos/seed/pothole1/800/600",
    status: "dispatched",
    address: "100 Main St, Cumming, GA 30040",
    description: "Large pothole near the curb on Main Street",
    classification: {
      category: "pothole",
      subcategory: "asphalt pothole in road lane",
      severity: 3,
      hazardRadiusM: 2,
      visibleSizeEstimate: "40cm wide, approx 8cm deep",
      isEmergency: false,
      confidence: 0.94,
      reasoning:
        "Clear asphalt depression in active traffic lane with exposed substrate",
    },
    workOrder: {
      department: "public_works",
      crewType: "road_repair",
      priorityScore: 8.5,
      estMinutes: 45,
      materials: [
        { item: "cold patch asphalt", qty: "50 lbs" },
        { item: "tamper", qty: 1 },
      ],
    },
  },
  {
    location: { lng: -84.1298, lat: 34.2115 },
    photoPublicUrl: "https://picsum.photos/seed/streetlight1/800/600",
    status: "open",
    address: "250 Pilgrim Mill Rd, Cumming, GA 30040",
    description: "Streetlight flickering and sometimes going dark",
    classification: {
      category: "streetlight",
      subcategory: "intermittent failure on residential street",
      severity: 2,
      hazardRadiusM: 15,
      visibleSizeEstimate: "single pole-mounted cobra head fixture",
      isEmergency: false,
      confidence: 0.88,
      reasoning:
        "Photo shows residential streetlight with visible burn marks on lens cover",
    },
    workOrder: {
      department: "utilities",
      crewType: "electrical",
      priorityScore: 5.0,
      estMinutes: 60,
      materials: [
        { item: "LED cobra head fixture", qty: 1 },
        { item: "photocell", qty: 1 },
      ],
    },
  },
  {
    location: { lng: -84.1421, lat: 34.2006 },
    photoPublicUrl: "https://picsum.photos/seed/graffiti1/800/600",
    status: "in_progress",
    address: "400 Dahlonega St, Cumming, GA 30040",
    description: "Graffiti on the retaining wall near the park entrance",
    classification: {
      category: "graffiti",
      subcategory: "spray paint on concrete retaining wall",
      severity: 1,
      hazardRadiusM: 5,
      visibleSizeEstimate: "3m x 1.5m spray-painted area",
      isEmergency: false,
      confidence: 0.97,
      reasoning:
        "Multiple colors of spray paint on public retaining wall, no structural damage",
    },
    workOrder: {
      department: "parks",
      crewType: "maintenance",
      priorityScore: 3.0,
      estMinutes: 90,
      materials: [
        { item: "graffiti remover solvent", qty: "2 gallons" },
        { item: "pressure washer", qty: 1 },
      ],
    },
  },
  {
    location: { lng: -84.1352, lat: 34.2145 },
    photoPublicUrl: "https://picsum.photos/seed/sidewalk1/800/600",
    status: "closed",
    address: "600 School Rd, Cumming, GA 30040",
    description: "Raised sidewalk slab near the elementary school",
    classification: {
      category: "sidewalk_damage",
      subcategory: "raised slab from tree root",
      severity: 4,
      hazardRadiusM: 3,
      visibleSizeEstimate: "1.2m section raised 5cm above adjacent slab",
      isEmergency: false,
      confidence: 0.91,
      reasoning:
        "Concrete slab heaved by tree root, trip hazard in school zone pedestrian path",
    },
    workOrder: {
      department: "public_works",
      crewType: "concrete",
      priorityScore: 14.0,
      estMinutes: 120,
      materials: [
        { item: "concrete slab", qty: 1 },
        { item: "root barrier", qty: "6 ft" },
        { item: "gravel base", qty: "100 lbs" },
      ],
    },
  },
  {
    location: { lng: -84.1265, lat: 34.2052 },
    photoPublicUrl: "https://picsum.photos/seed/illegaldump1/800/600",
    status: "open",
    address: "Near 800 Lake Lanier Dr, Cumming, GA 30040",
    description: "Pile of household debris dumped on the roadside",
    classification: {
      category: "illegal_dump",
      subcategory: "household furniture and bags of trash",
      severity: 3,
      hazardRadiusM: 8,
      visibleSizeEstimate: "approx 2m x 3m pile of mixed waste",
      isEmergency: false,
      confidence: 0.92,
      reasoning:
        "Visible pile of discarded furniture and trash bags on public right-of-way",
    },
    workOrder: {
      department: "sanitation",
      crewType: "hauling",
      priorityScore: 7.0,
      estMinutes: 60,
      materials: [{ item: "roll-off dumpster", qty: 1 }],
    },
  },
];

async function seedReports(cityId: string, reporterId: string): Promise<void> {
  // Idempotency: skip seed reports whose address already exists in this city,
  // so re-running the seed never duplicates the sample corpus.
  const { data: existing } = await supabase
    .from("reports")
    .select("address")
    .eq("city_id", cityId);
  const seenAddresses = new Set(
    (existing ?? []).map((r) => (r as { address: string | null }).address),
  );

  for (const sr of SEED_REPORTS) {
    if (seenAddresses.has(sr.address)) {
      console.log(`Report skipped (already seeded): ${sr.address}`);
      continue;
    }
    // Insert report
    const [report] = await assertOk(
      supabase
        .from("reports")
        .insert({
          city_id: cityId,
          reporter_id: reporterId,
          location: pointWKT(sr.location.lng, sr.location.lat),
          photo_public_url: sr.photoPublicUrl,
          status: sr.status,
          address: sr.address,
          description: sr.description,
          submit_duration_ms: Math.floor(Math.random() * 8000) + 3000, // 3-11s
        })
        .select("id")
        .limit(1),
      `reports.insert(${sr.address})`,
    );

    const reportId = report.id;

    // Insert classification
    await assertOk(
      supabase
        .from("classifications")
        .insert({
          report_id: reportId,
          category: sr.classification.category,
          subcategory: sr.classification.subcategory,
          severity: sr.classification.severity,
          hazard_radius_m: sr.classification.hazardRadiusM,
          visible_size_estimate: sr.classification.visibleSizeEstimate,
          is_emergency: sr.classification.isEmergency,
          confidence: sr.classification.confidence,
          reasoning: sr.classification.reasoning,
          model_version: "gemini-2.5-flash-v1",
          raw_response: sr.classification,
        })
        .select("id"),
      `classifications.insert(${sr.classification.category})`,
    );

    // Insert work order
    await assertOk(
      supabase
        .from("work_orders")
        .insert({
          report_id: reportId,
          department: sr.workOrder.department,
          crew_type: sr.workOrder.crewType,
          priority_score: sr.workOrder.priorityScore,
          est_minutes: sr.workOrder.estMinutes,
          materials: sr.workOrder.materials,
        })
        .select("id"),
      `work_orders.insert(${sr.workOrder.department})`,
    );

    console.log(
      `Report seeded: ${sr.classification.category} at ${sr.address} — ${reportId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("--- Civic seed: start ---\n");

  if (DRY_RUN) {
    console.log("[dry-run] no writes will be made. Plan:");
    console.log("  • upsert city: cumming (Cumming, GA)");
    console.log(`  • upsert ${TEST_USERS.length} users:`);
    for (const u of TEST_USERS) console.log(`      - ${u.role}: ${u.email}`);
    console.log(
      `  • seed up to ${SEED_REPORTS.length} reports (skipping any address already present):`,
    );
    for (const sr of SEED_REPORTS)
      console.log(`      - ${sr.classification.category} @ ${sr.address}`);
    console.log("\n--- Civic seed: dry-run complete (nothing written) ---");
    return;
  }

  const cityId = await seedCity();
  const userIds = await seedUsers(cityId);
  await seedReports(cityId, userIds.resident);

  console.log("\n--- Civic seed: complete ---");
  console.log("\nTest credentials:");
  for (const u of TEST_USERS) {
    console.log(`  ${u.role.padEnd(20)} ${u.email} / ${u.password}`);
  }
}

main().catch((err) => {
  console.error("Unexpected seed error:", err);
  process.exit(1);
});

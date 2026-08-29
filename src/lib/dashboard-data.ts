import { cache } from "react";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";
import type { TeamId } from "@/lib/teams";
import type { City, ReportCategory, ReportStatus } from "@/lib/types";
import { DAY_MS } from "@/lib/utils/time-constants";

const logger = createLogger("dashboard-data");

/* ------------------------------------------------------------------
   Dashboard-specific types (flattened from Report + Classification)
   ------------------------------------------------------------------ */

export interface DashboardReport {
  id: string;
  category: ReportCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  status: ReportStatus;
  address: string;
  location: { lng: number; lat: number };
  photo_public_url: string;
  created_at: string;
  reporter_id: string;
  tags?: string[];
  // Optional persisted team assignment. When unset, routing falls back to
  // categoryToTeam(category). Per-report runtime overrides live in
  // src/lib/teams-overrides.ts and shadow this field client-side.
  assigned_team?: TeamId;
  // Admin-set public fix estimates (populated when staff marks "under fix").
  fix_cost_estimate?: number | null;
  fix_time_estimate_days?: number | null;
  fix_note?: string | null;
  marked_under_fix_at?: string | null;
  // Demo overlay (src/lib/demo-reports.ts): true for the presenter-injected
  // "live" data point. Surfaces render it with a blue glow.
  demo?: boolean;
  // Baked AI classification text shown in expanded views for demo reports.
  ai_reasoning?: string;
  // Task-completion overlay (src/lib/task-completion.ts), resolved into the
  // corpus by FilterProvider. When a team marks a task done, status becomes
  // "closed" and these carry the resolution photo + timestamp for before/after.
  afterPhoto?: string;
  completed_at?: string;
}

export interface CityStats {
  total: number;
  open: number;
  resolved: number;
  avg_resolution_hours: number;
  this_week: number;
  prev_week: number;
}

export interface CategoryCount {
  category: ReportCategory;
  count: number;
}

/* ------------------------------------------------------------------
   Known cities — used for generateStaticParams + fallback coords
   ------------------------------------------------------------------ */

export const KNOWN_CITIES: Record<
  string,
  { name: string; state: string; center: [number, number]; zoom: number }
> = {
  cumming: {
    name: "Cumming",
    state: "GA",
    center: [-84.1402, 34.2073],
    zoom: 12,
  },
};

/* ------------------------------------------------------------------
   Municipality directory — powers the city switcher in the dashboard
   header. `live` cities have a working dashboard; the rest are
   expansion targets in the same Forsyth County footprint, shown as
   "Soon" so the rollout story (Cumming -> Forsyth -> every neighbor)
   is visible without linking to empty dashboards.
   ------------------------------------------------------------------ */

export interface Municipality {
  slug: string;
  name: string;
  state: string;
  county: string;
  live: boolean;
}

export const MUNICIPALITIES: Municipality[] = [
  {
    slug: "ahilyanagar",
    name: "Ahilyanagar",
    state: "Maharashtra",
    county: "Ahmednagar District",
    live: true,
  },
  {
    slug: "cumming",
    name: "Cumming",
    state: "GA",
    county: "Forsyth County",
    live: true,
  },
  {
    slug: "south-forsyth",
    name: "South Forsyth",
    state: "GA",
    county: "Forsyth County",
    live: false,
  },
  {
    slug: "coal-mountain",
    name: "Coal Mountain",
    state: "GA",
    county: "Forsyth County",
    live: false,
  },
  {
    slug: "sawnee",
    name: "Sawnee",
    state: "GA",
    county: "Forsyth County",
    live: false,
  },
  {
    slug: "alpharetta",
    name: "Alpharetta",
    state: "GA",
    county: "Fulton County",
    live: false,
  },
  {
    slug: "milton",
    name: "Milton",
    state: "GA",
    county: "Fulton County",
    live: false,
  },
  {
    slug: "gainesville",
    name: "Gainesville",
    state: "GA",
    county: "Hall County",
    live: false,
  },
  {
    slug: "buford",
    name: "Buford",
    state: "GA",
    county: "Gwinnett County",
    live: false,
  },
  {
    slug: "suwanee",
    name: "Suwanee",
    state: "GA",
    county: "Gwinnett County",
    live: false,
  },
  {
    slug: "dawsonville",
    name: "Dawsonville",
    state: "GA",
    county: "Dawson County",
    live: false,
  },
];

/* ------------------------------------------------------------------
   Category metadata — labels, colors, icons

   Category palette: same generator as the team palette (@/lib/teams) —
   OKLCH at a constant L=0.63 with C = min(0.185, 90% of that hue's in-gamut
   maximum), so the eleven chromatic categories brighten as one family
   instead of one entry out-shouting the rest at a 8px dot. Every entry keeps
   its previous hue anchor except the two that had none:

     - debris was #8a8a90 (C=0.009, a grey) and took the open teal slot.
     - faded_signage was #b6b6bc (C=0.008, a grey at 2.0:1 on white — it
       simply vanished) and took the open rose slot, deliberately far from
       downed_sign, the only other category sharing the sign-post glyph.

   Ten of these are byte-identical to their owning team's color (see
   CATEGORY_TO_TEAM): a category dot and its department dot are the same
   hue on purpose, because they are the same routing fact. Two are not, and
   are cross-wired the same way the old palette was: illegal_dump keeps its
   olive anchor (Environmental Services' hue) while Code Enforcement owns it,
   and debris now wears Code Enforcement's teal while Environmental Services
   owns it. Swapping them would trade a preserved hue for a routing pun.

   These are GRAPHIC fills (dots, bars, glyph strokes) at ~3.3-3.9:1 on
   white. Used as TEXT? Mix toward --team-text-mix / --team-text-amount
   (globals.css), the same fill-vs-text split the status tokens use.
   ------------------------------------------------------------------ */

export const CATEGORY_META: Record<
  ReportCategory,
  { label: string; color: string; icon: string }
> = {
  pothole: { label: "Pothole", color: "#e35044", icon: "circle-alert" },
  streetlight: { label: "Streetlight", color: "#a48525", icon: "lightbulb" },
  downed_sign: { label: "Downed Sign", color: "#9c68e6", icon: "sign-post" },
  graffiti: { label: "Graffiti", color: "#d052a8", icon: "spray-can" },
  illegal_dump: { label: "Illegal Dump", color: "#6a9a25", icon: "trash-2" },
  water_leak: { label: "Water Leak", color: "#2995c0", icon: "droplets" },
  sidewalk_damage: { label: "Sidewalk", color: "#c57124", icon: "footprints" },
  tree_down: { label: "Tree Down", color: "#2ba06e", icon: "tree-pine" },
  debris: { label: "Debris", color: "#2a9b9c", icon: "construction" },
  drainage: { label: "Drainage", color: "#5082f4", icon: "waves" },
  faded_signage: {
    label: "Faded Signage",
    color: "#df4c7a",
    icon: "sign-post",
  },
  other: { label: "Other", color: "#787783", icon: "help-circle" },
};

/* ------------------------------------------------------------------
   Per-category SLA targets (hours to resolution). Used by analytics
   to compute breach % per category. Values reflect operational urgency:
   safety hazards (water leak, tree down) are tighter than cosmetic ones.
   ------------------------------------------------------------------ */

export const CATEGORY_SLA_TARGETS: Record<ReportCategory, number> = {
  water_leak: 24,
  tree_down: 24,
  downed_sign: 36,
  pothole: 72,
  drainage: 72,
  sidewalk_damage: 96,
  streetlight: 96,
  illegal_dump: 96,
  debris: 120,
  graffiti: 168,
  faded_signage: 240,
  other: 168,
};

/* ------------------------------------------------------------------
   Data fetching
   ------------------------------------------------------------------ */

// Placeholder UUID — only ever returned when the DB lookup fails, so readers
// and writers don't disagree silently (they share the resolved real row below).
const CITY_SLUG_TO_UUID: Record<string, string> = {
  cumming: "00000000-0000-0000-0000-000000000001",
};

// Module-level cache: slug -> resolved real City row. fetchCity is called on
// every dashboard render; one round-trip per slug per process is plenty.
const _cityCache = new Map<string, City>();

export async function fetchCity(slug: string): Promise<City | null> {
  const known = KNOWN_CITIES[slug];
  if (!known) return null;

  const cached = _cityCache.get(slug);
  if (cached) return cached;

  const fallback: City = {
    id: CITY_SLUG_TO_UUID[slug] ?? "00000000-0000-0000-0000-000000000000",
    slug,
    name: known.name,
    state: known.state,
    boundary: null,
    open311_jurisdiction_id: null,
    active: true,
  };

  try {
    const { createServerClient } = await import("@/lib/db/client");
    const db = createServerClient();
    const { data, error } = await db
      .from("cities")
      .select("id, slug, name, state, open311_jurisdiction_id, active")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) {
      logger.warn(
        "Falling back to placeholder city (query error or not found)",
        {
          slug,
        },
      );
      return fallback;
    }
    const city: City = { ...(data as Omit<City, "boundary">), boundary: null };
    _cityCache.set(slug, city);
    return city;
  } catch (err) {
    logger.warn("Falling back to placeholder city (exception)", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

/* ------------------------------------------------------------------
   Mock corpus — 120 historical reports spanning the last ~6 months.
   Distributed ~20/month with realistic age-correlated status:
   fresh reports skew open/dispatched, old reports skew closed.
   ------------------------------------------------------------------ */

const STREET_NAMES = [
  "Main St",
  "Elm Ave",
  "Oak Dr",
  "Peachtree Rd",
  "Maple Ln",
  "Walnut Ct",
  "Cedar Blvd",
  "Pine Way",
  "Birch St",
  "Willow Ave",
  "Spruce Dr",
  "Hickory Rd",
  "Poplar Ln",
  "Magnolia Ct",
  "Dogwood Blvd",
  "Chestnut Way",
  "Sycamore St",
  "Aspen Ave",
  "Redwood Dr",
  "Juniper Rd",
];

const CATEGORY_WEIGHTS: ReadonlyArray<readonly [ReportCategory, number]> = [
  ["pothole", 68],
  ["streetlight", 41],
  ["water_leak", 29],
  ["sidewalk_damage", 24],
  ["downed_sign", 22],
  ["graffiti", 18],
  ["tree_down", 14],
  ["drainage", 12],
  ["illegal_dump", 8],
  ["debris", 6],
  ["faded_signage", 3],
  ["other", 2],
];

const SEVERITY_WEIGHTS: ReadonlyArray<readonly [1 | 2 | 3 | 4 | 5, number]> = [
  [1, 5],
  [2, 20],
  [3, 40],
  [4, 25],
  [5, 10],
];

// Deterministic pseudo-random in [0,1) seeded by (i, salt). Stable across SSR + CSR.
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pickWeighted<T>(
  items: ReadonlyArray<readonly [T, number]>,
  r: number,
): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  const target = r * total;
  let acc = 0;
  for (const [val, w] of items) {
    acc += w;
    if (target < acc) return val;
  }
  return items[items.length - 1][0];
}

function statusForAge(ageDays: number, r: number): ReportStatus {
  if (ageDays > 60) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 88],
        ["merged", 6],
        ["rejected", 6],
      ],
      r,
    );
  }
  if (ageDays > 14) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 70],
        ["in_progress", 15],
        ["dispatched", 7],
        ["open", 4],
        ["rejected", 4],
      ],
      r,
    );
  }
  if (ageDays > 3) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 66],
        ["in_progress", 18],
        ["dispatched", 10],
        ["open", 6],
      ],
      r,
    );
  }
  return pickWeighted<ReportStatus>(
    [
      ["open", 34],
      ["dispatched", 24],
      ["in_progress", 24],
      ["closed", 18],
    ],
    r,
  );
}

interface CorpusReport extends DashboardReport {
  age_days: number;
}

// Real, category-appropriate report photos. Sourced + visually verified from
// Wikimedia Commons (CC-licensed) and uploaded to the public storage bucket at
// seed/<category>.jpg — one image per issue type so every report shows a photo
// that actually matches the issue (replaces the old random picsum placeholders).
const PHOTO_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/photos-public/seed`;
const categoryPhoto = (category: ReportCategory): string =>
  `${PHOTO_BASE}/${category}.jpg`;

function buildCorpus(): CorpusReport[] {
  // Live deployments (NEXT_PUBLIC_DEMO_MODE=0) run with an empty corpus —
  // every dashboard/analytics surface derives from real Supabase rows or
  // renders empty. Demo deployments get the full synthetic city below.
  if (!DEMO_MODE) return [];
  const N = 1100;
  const SPAN_DAYS = 180; // ~6 months
  const RECENCY = 1.6; // >1 front-loads activity toward the present (dense recent window)
  const now = Date.now();
  const center = KNOWN_CITIES.cumming.center;
  const lngSpread = 0.048;
  const latSpread = 0.048;

  const reports: CorpusReport[] = Array.from({ length: N }, (_, i) => {
    // Power-curve age: u^RECENCY clusters reports toward the present, so the
    // recent window (what the chart shows) is densely populated while older
    // history thins out. Small jitter keeps the timeline off a perfect grid.
    const baseAge = ((i + 0.5) / N) ** RECENCY * SPAN_DAYS;
    const jitter = (seeded(i, 10) - 0.5) * 1.5;
    const ageDays = Math.max(0.1, baseAge + jitter);

    const category = pickWeighted(CATEGORY_WEIGHTS, seeded(i, 1));
    const severity = pickWeighted(SEVERITY_WEIGHTS, seeded(i, 2));
    const status = statusForAge(ageDays, seeded(i, 3));

    const streetName =
      STREET_NAMES[Math.floor(seeded(i, 4) * STREET_NAMES.length)];
    const houseNum = 100 + Math.floor(seeded(i, 5) * 900);

    // Power-law reporter distribution: squaring the uniform draw biases toward
    // low ids, so a handful of "power reporters" file disproportionately many.
    const reporterPool = 40;
    const reporterIdx = Math.floor(seeded(i, 8) ** 2 * reporterPool);

    return {
      id: `report-${i + 1}`,
      category,
      severity,
      status,
      address: `${houseNum} ${streetName}`,
      location: {
        lng: center[0] + (seeded(i, 6) - 0.5) * lngSpread,
        lat: center[1] + (seeded(i, 7) - 0.5) * latSpread,
      },
      photo_public_url: categoryPhoto(category),
      created_at: new Date(now - ageDays * DAY_MS).toISOString(),
      age_days: ageDays,
      reporter_id: `reporter-${reporterIdx + 1}`,
    };
  });

  // Most-recent first so slicing returns the freshest reports.
  return reports.sort((a, b) => a.age_days - b.age_days);
}

const REPORT_CORPUS: CorpusReport[] = buildCorpus();

function stripCorpus(r: CorpusReport): DashboardReport {
  const { age_days: _ignored, ...rest } = r;
  void _ignored;
  return rest;
}

/* ------------------------------------------------------------------
   Full corpus accessor — the single source of truth that the shared
   filter context loads once and every dashboard/analytics widget
   derives from. age_days is stripped; derive functions recompute age
   from created_at so they stay pure and corpus-shape stays clean.
   ------------------------------------------------------------------ */

export const getReportCorpus = cache((): DashboardReport[] =>
  REPORT_CORPUS.map(stripCorpus),
);

export async function fetchCityStats(cityId: string): Promise<CityStats> {
  void cityId;

  const total = REPORT_CORPUS.length;
  const open = REPORT_CORPUS.filter((r) => r.status === "open").length;
  const resolved = REPORT_CORPUS.filter((r) => r.status === "closed").length;

  // Re-derive age from created_at at request time so week buckets stay in sync
  // with getCityMorale (which does the same) instead of the module-load age_days,
  // which freezes at build time and drifts across a long-lived server process.
  const now = Date.now();
  const ageDays = (r: CorpusReport) =>
    (now - new Date(r.created_at).getTime()) / 86_400_000;
  const this_week = REPORT_CORPUS.filter((r) => ageDays(r) <= 7).length;
  const prev_week = REPORT_CORPUS.filter(
    (r) => ageDays(r) > 7 && ageDays(r) <= 14,
  ).length;

  // Synthetic avg resolution: severity-weighted hours (sev 1 ~30h, sev 5 ~102h).
  const closed = REPORT_CORPUS.filter((r) => r.status === "closed");
  const avg_resolution_hours =
    closed.length === 0
      ? 0
      : Math.round(
          closed.reduce((s, r) => s + 12 + r.severity * 18, 0) / closed.length,
        );

  return { total, open, resolved, avg_resolution_hours, this_week, prev_week };
}

export async function fetchCategoryBreakdown(
  cityId: string,
): Promise<CategoryCount[]> {
  void cityId;
  const counts = new Map<ReportCategory, number>();
  for (const r of REPORT_CORPUS) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export async function fetchRecentReports(
  cityId: string,
  limit = 20,
): Promise<DashboardReport[]> {
  void cityId;
  return REPORT_CORPUS.slice(0, limit).map(stripCorpus);
}

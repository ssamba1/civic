import type { City, Report, ReportCategory, ReportStatus } from "@/lib/types";
import type { TeamId } from "@/lib/teams";

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
  // Demo overlay (src/lib/demo-reports.ts): true for the presenter-injected
  // "live" data point. Surfaces render it with a blue glow.
  demo?: boolean;
  // Baked AI classification text shown in expanded views for demo reports.
  ai_reasoning?: string;
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
   Category metadata — labels, colors, icons
   ------------------------------------------------------------------ */

export const CATEGORY_META: Record<
  ReportCategory,
  { label: string; color: string; icon: string }
> = {
  pothole: { label: "Pothole", color: "#ef4444", icon: "circle-alert" },
  streetlight: { label: "Streetlight", color: "#f59e0b", icon: "lightbulb" },
  downed_sign: { label: "Downed Sign", color: "#8b5cf6", icon: "sign-post" },
  graffiti: { label: "Graffiti", color: "#ec4899", icon: "spray-can" },
  illegal_dump: { label: "Illegal Dump", color: "#84cc16", icon: "trash-2" },
  water_leak: { label: "Water Leak", color: "#06b6d4", icon: "droplets" },
  sidewalk_damage: { label: "Sidewalk", color: "#f97316", icon: "footprints" },
  tree_down: { label: "Tree Down", color: "#22c55e", icon: "tree-pine" },
  debris: { label: "Debris", color: "#a3a3a3", icon: "construction" },
  drainage: { label: "Drainage", color: "#3b82f6", icon: "waves" },
  faded_signage: { label: "Faded Signage", color: "#d4d4d4", icon: "sign-post" },
  other: { label: "Other", color: "#737373", icon: "help-circle" },
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
   Data fetching — mock until Supabase tables exist
   TODO: Replace with real Supabase queries once the civic schema is migrated
   ------------------------------------------------------------------ */

// TODO: Replace with real Supabase query: `select * from cities where slug = $slug limit 1`
// The UUID below is a deterministic placeholder — real rows will have actual Postgres UUIDs.
const CITY_SLUG_TO_UUID: Record<string, string> = {
  cumming: "00000000-0000-0000-0000-000000000001",
};

export async function fetchCity(slug: string): Promise<City | null> {
  const known = KNOWN_CITIES[slug];
  if (!known) return null;
  return {
    id: CITY_SLUG_TO_UUID[slug] ?? "00000000-0000-0000-0000-000000000000",
    slug,
    name: known.name,
    state: known.state,
    boundary: null,
    open311_jurisdiction_id: null,
    active: true,
  };
}

/* ------------------------------------------------------------------
   Mock corpus — 120 historical reports spanning the last ~6 months.
   Distributed ~20/month with realistic age-correlated status:
   fresh reports skew open/dispatched, old reports skew closed.
   ------------------------------------------------------------------ */

const STREET_NAMES = [
  "Main St", "Elm Ave", "Oak Dr", "Peachtree Rd", "Maple Ln",
  "Walnut Ct", "Cedar Blvd", "Pine Way", "Birch St", "Willow Ave",
  "Spruce Dr", "Hickory Rd", "Poplar Ln", "Magnolia Ct", "Dogwood Blvd",
  "Chestnut Way", "Sycamore St", "Aspen Ave", "Redwood Dr", "Juniper Rd",
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
const categoryPhoto = (category: ReportCategory): string => `${PHOTO_BASE}/${category}.jpg`;

function buildCorpus(): CorpusReport[] {
  const N = 1100;
  const SPAN_DAYS = 180; // ~6 months
  const RECENCY = 1.6; // >1 front-loads activity toward the present (dense recent window)
  const DAY_MS = 86_400_000;
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

    const streetName = STREET_NAMES[Math.floor(seeded(i, 4) * STREET_NAMES.length)];
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

export function getReportCorpus(): DashboardReport[] {
  return REPORT_CORPUS.map(stripCorpus);
}

export async function fetchCityStats(cityId: string): Promise<CityStats> {
  void cityId;

  const total = REPORT_CORPUS.length;
  const open = REPORT_CORPUS.filter((r) => r.status === "open").length;
  const resolved = REPORT_CORPUS.filter((r) => r.status === "closed").length;
  const this_week = REPORT_CORPUS.filter((r) => r.age_days <= 7).length;
  const prev_week = REPORT_CORPUS.filter(
    (r) => r.age_days > 7 && r.age_days <= 14,
  ).length;

  // Synthetic avg resolution: severity-weighted hours (sev 1 ~30h, sev 5 ~102h).
  const closed = REPORT_CORPUS.filter((r) => r.status === "closed");
  const avg_resolution_hours = closed.length === 0
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

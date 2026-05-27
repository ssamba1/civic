import type { City, Report, ReportCategory, ReportStatus } from "@/lib/types";

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
   Data fetching — mock until Supabase tables exist
   TODO: Replace with real Supabase queries once the civic schema is migrated
   ------------------------------------------------------------------ */

export async function fetchCity(slug: string): Promise<City | null> {
  const known = KNOWN_CITIES[slug];
  if (!known) return null;
  return {
    id: slug,
    slug,
    name: known.name,
    state: known.state,
    boundary: null,
    open311_jurisdiction_id: null,
    active: true,
  };
}

export async function fetchCityStats(cityId: string): Promise<CityStats> {
  // TODO: Replace with Supabase aggregate query
  void cityId;
  return {
    total: 247,
    open: 43,
    resolved: 189,
    avg_resolution_hours: 72,
    this_week: 18,
    prev_week: 12,
  };
}

export async function fetchCategoryBreakdown(
  cityId: string,
): Promise<CategoryCount[]> {
  // TODO: Replace with Supabase group-by query
  void cityId;
  const mock: CategoryCount[] = [
    { category: "pothole", count: 68 },
    { category: "streetlight", count: 41 },
    { category: "water_leak", count: 29 },
    { category: "sidewalk_damage", count: 24 },
    { category: "downed_sign", count: 22 },
    { category: "graffiti", count: 18 },
    { category: "tree_down", count: 14 },
    { category: "drainage", count: 12 },
    { category: "illegal_dump", count: 8 },
    { category: "debris", count: 6 },
    { category: "faded_signage", count: 3 },
    { category: "other", count: 2 },
  ];
  return mock.sort((a, b) => b.count - a.count);
}

export async function fetchRecentReports(
  cityId: string,
  limit = 20,
): Promise<DashboardReport[]> {
  // TODO: Replace with Supabase query (join reports + classifications, strip PII)
  void cityId;
  void limit;

  const categories: ReportCategory[] = [
    "pothole",
    "streetlight",
    "water_leak",
    "sidewalk_damage",
    "downed_sign",
    "graffiti",
    "tree_down",
    "drainage",
  ];
  const statuses: ReportStatus[] = ["open", "dispatched", "in_progress", "closed"];
  const streets = [
    "201 Main St",
    "445 Elm Ave",
    "312 Oak Dr",
    "100 Peachtree Rd",
    "889 Maple Ln",
    "550 Walnut Ct",
    "77 Cedar Blvd",
    "623 Pine Way",
    "410 Birch St",
    "901 Willow Ave",
    "156 Spruce Dr",
    "234 Hickory Rd",
    "678 Poplar Ln",
    "345 Magnolia Ct",
    "512 Dogwood Blvd",
    "789 Chestnut Way",
    "111 Sycamore St",
    "432 Aspen Ave",
    "867 Redwood Dr",
    "290 Juniper Rd",
  ];

  const center = KNOWN_CITIES.cumming.center;
  const now = Date.now();

  return Array.from({ length: 20 }, (_, i) => ({
    id: `report-${i + 1}`,
    category: categories[i % categories.length],
    severity: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    status: statuses[i % statuses.length],
    address: streets[i],
    location: {
      lng: center[0] + (Math.random() - 0.5) * 0.06,
      lat: center[1] + (Math.random() - 0.5) * 0.04,
    },
    photo_public_url: `/placeholder-report-${(i % 4) + 1}.jpg`,
    created_at: new Date(now - i * 3_600_000 * (2 + Math.random() * 10)).toISOString(),
  }));
}

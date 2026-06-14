import "server-only";
import { cache } from "react";
import { z } from "zod/v4";
import type {
  CategoryCount,
  CityStats,
  DashboardReport,
} from "@/lib/dashboard-data";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { City, ReportCategory, ReportStatus } from "@/lib/types";

// Error strategy for this module: log via the shared logger (Sentry-backed) and
// return a safe empty/zeroed value. These run during SSR of the public dashboard
// — throwing would 500 the whole page, so degrade gracefully instead.
const log = createLogger("dashboard-queries");

// Supabase failures surface two ways: as `{ error }` objects (PostgREST errors)
// and as THROWN exceptions (network drop, truncated body → postgrest-js's
// unguarded JSON.parse rejects the whole await). Each query below handles the
// first; this wrapper catches the second so the module's no-throw contract
// holds for both.
async function safeQuery<T>(
  label: string,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    log.error(`${label} threw`, err);
    return fallback;
  }
}

// Request-scoped memoization: a city page renders both `generateMetadata` and
// the page body, each of which looks up the same city by slug. `cache()` dedupes
// those into a single Supabase round-trip per request (no cross-request caching).
export const fetchCity = cache(
  async (slug: string): Promise<City | null> =>
    safeQuery("fetchCity", null as City | null, async () => {
      const db = createServerClient();
      const { data, error } = await db
        .from("cities")
        .select("id, slug, name, state, open311_jurisdiction_id, active")
        .eq("slug", slug)
        .maybeSingle();
      if (error || !data) return null;
      return { ...data, boundary: null } as City;
    }),
);

const EMPTY_STATS: CityStats = {
  total: 0,
  open: 0,
  resolved: 0,
  avg_resolution_hours: 0,
  this_week: 0,
  prev_week: 0,
};

export async function fetchCityStats(cityId: string): Promise<CityStats> {
  return safeQuery("fetchCityStats", EMPTY_STATS, async () => {
    const db = createServerClient();
    const { data, error } = await db
      .rpc("city_stats", { _city_id: cityId })
      .maybeSingle<{
        total: number;
        open_count: number;
        resolved: number;
        this_week: number;
        prev_week: number;
        avg_hours: number;
      }>();
    if (error) log.error("city_stats RPC failed", error, { cityId });
    return {
      total: Number(data?.total ?? 0),
      open: Number(data?.open_count ?? 0),
      resolved: Number(data?.resolved ?? 0),
      avg_resolution_hours: Number(data?.avg_hours ?? 0),
      this_week: Number(data?.this_week ?? 0),
      prev_week: Number(data?.prev_week ?? 0),
    };
  });
}

export async function fetchCategoryBreakdown(
  cityId: string,
): Promise<CategoryCount[]> {
  return safeQuery(
    "fetchCategoryBreakdown",
    [] as CategoryCount[],
    async () => {
      const db = createServerClient();
      const { data, error } = await db.rpc("city_category_breakdown", {
        _city_id: cityId,
      });
      if (error)
        log.error("city_category_breakdown RPC failed", error, { cityId });
      return (data ?? []).map(
        (r: { category: ReportCategory; count: number }) => ({
          category: r.category,
          count: Number(r.count),
        }),
      );
    },
  );
}

const ViewRowSchema = z.object({
  id: z.string(),
  category: z
    .enum([
      "pothole",
      "streetlight",
      "downed_sign",
      "graffiti",
      "illegal_dump",
      "water_leak",
      "sidewalk_damage",
      "tree_down",
      "debris",
      "drainage",
      "faded_signage",
      "other",
    ] as const)
    .nullable(),
  severity: z.number().nullable(),
  status: z.enum([
    "open",
    "dispatched",
    "in_progress",
    "closed",
    "merged",
    "rejected",
  ] as const),
  address: z.string().nullable(),
  lng: z.number().nullable(),
  lat: z.number().nullable(),
  photo_public_url: z.string(),
  created_at: z.string(),
  tags: z.array(z.string()).nullable(),
});

export async function fetchRecentReports(
  cityId: string,
  limit = 20,
): Promise<DashboardReport[]> {
  return safeQuery("fetchRecentReports", [] as DashboardReport[], async () => {
    const db = createServerClient();
    const { data, error } = await db
      .from("dashboard_reports_view")
      .select(
        "id, category, severity, status, address, lng, lat, photo_public_url, created_at, tags",
      )
      .eq("city_id", cityId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error)
      log.error("fetchRecentReports view query failed", error, { cityId });
    if (error || !data) return [];

    const parsed = z.array(ViewRowSchema).safeParse(data);
    if (!parsed.success) {
      log.error("fetchRecentReports schema mismatch", parsed.error, { cityId });
      return [];
    }

    return parsed.data.map((r) => ({
      id: r.id,
      category: (r.category ?? "other") as ReportCategory,
      severity: (r.severity ?? 3) as 1 | 2 | 3 | 4 | 5,
      status: r.status,
      address: r.address ?? "Unknown location",
      location: { lng: r.lng ?? 0, lat: r.lat ?? 0 },
      photo_public_url: r.photo_public_url,
      created_at: r.created_at,
      // reporter_id is PII — stripped from the public view; placeholder satisfies the type.
      reporter_id: "",
      tags: r.tags ?? [],
    }));
  });
}

/**
 * Fetch all report lat/lng pairs across all cities, cluster nearby points by
 * a ~25 km grid (0.25° rounding), and return one marker per cluster.
 * Falls back to an empty array — callers should handle gracefully.
 */
export async function fetchReportMarkers(): Promise<
  Array<{ id: string; location: [number, number]; label: string }>
> {
  return safeQuery(
    "fetchReportMarkers",
    [] as Array<{ id: string; location: [number, number]; label: string }>,
    async () => {
      const db = createServerClient();
      const { data, error } = await db
        .from("dashboard_reports_view")
        .select("id, lat, lng, address")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) log.error("fetchReportMarkers view query failed", error);
      if (!data) return [];

      // Grid-based deduplication: round to nearest 0.25° (≈25 km)
      const GRID = 0.25;
      const seen = new Map<
        string,
        { lat: number; lng: number; label: string }
      >();

      for (const row of data as Array<{
        id: string;
        lat: number | null;
        lng: number | null;
        address: string | null;
      }>) {
        if (row.lat == null || row.lng == null) continue;
        const key = `${Math.round(row.lat / GRID)},${Math.round(row.lng / GRID)}`;
        if (!seen.has(key)) {
          // Use the last two address parts (e.g. "Cumming, GA") as label
          const parts = (row.address ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const label =
            parts.length >= 2
              ? parts.slice(-2).join(", ")
              : (parts[0] ?? "Report");
          seen.set(key, { lat: row.lat, lng: row.lng, label });
        }
      }

      return Array.from(seen.entries()).map(([key, val]) => ({
        id: `report-${key}`,
        location: [val.lat, val.lng] as [number, number],
        label: val.label,
      }));
    },
  );
}

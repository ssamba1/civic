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
import type { City, ReportCategory } from "@/lib/types";

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

// Cross-request, in-process memo of resolved centers (keyed by slug). Until
// migration 020 is applied the city_center RPC 404s and every map SSR falls to
// a live geocode; this cache collapses repeat renders of the same city on a warm
// instance to a single Nominatim hit, easing the public endpoint's rate limit.
// Serverless cold starts reset it (low downside); applying the migration removes
// the geocode path entirely.
const _centerCache = new Map<string, [number, number]>();

/**
 * Resolve a city's map center as [lng, lat]. Tries the stored geocoded point
 * first (city_center RPC, migration 020); if that's unavailable — the migration
 * isn't applied yet, or the city has no stored center — falls back to a live
 * name/state geocode (memoized per slug above). Returns null only when both
 * fail, leaving the caller to use its own default.
 */
export const fetchCityCenter = cache(
  async (
    slug: string,
    name: string,
    state: string,
  ): Promise<[number, number] | null> =>
    safeQuery("fetchCityCenter", null as [number, number] | null, async () => {
      const cached = _centerCache.get(slug);
      if (cached) return cached;

      const db = createServerClient();
      const { data, error } = await db
        .rpc("city_center", { _slug: slug })
        .maybeSingle<{ lng: number; lat: number }>();
      // Distinguish "row of nulls" from a real point: Number(null) === 0 would
      // otherwise pass isFinite and center the map on null island [0,0].
      if (!error && data?.lng != null && data?.lat != null) {
        const lng = Number(data.lng);
        const lat = Number(data.lat);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          const point: [number, number] = [lng, lat];
          _centerCache.set(slug, point);
          return point;
        }
      }
      // RPC missing (migration unapplied) or no stored point → live geocode.
      const geocoded = await geocodeByName(name, state);
      if (geocoded) _centerCache.set(slug, geocoded);
      return geocoded;
    }),
);

/** Last-resort center lookup: geocode "Name, State, USA" via Nominatim. */
async function geocodeByName(
  name: string,
  state: string,
): Promise<[number, number] | null> {
  // Guard on real inputs (an empty name/state would geocode the country centroid).
  if (!name.trim() || !state.trim()) return null;
  const q = `${name.trim()}, ${state.trim()}, USA`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,
      {
        headers: {
          // Nominatim requires an identifying User-Agent.
          "User-Agent":
            "civic-app/1.0 (+https://civic-social-impact.vercel.app)",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const lat = Number(rows[0].lat);
    const lng = Number(rows[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  } catch (err) {
    log.error("geocodeByName failed", err);
    return null;
  }
}

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

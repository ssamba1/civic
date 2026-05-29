import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient } from "@/lib/db/ssr-client";
import type { City, ReportCategory, ReportStatus } from "@/lib/types";
import type {
  CityStats,
  CategoryCount,
  DashboardReport,
} from "@/lib/dashboard-data";

export async function fetchCity(slug: string): Promise<City | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("cities")
    .select("id, slug, name, state, open311_jurisdiction_id, active")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, boundary: null } as City;
}

export async function fetchCityStats(cityId: string): Promise<CityStats> {
  const db = createServerClient();
  const { data } = await db.rpc("city_stats", { _city_id: cityId }).maybeSingle<{
    total: number;
    open_count: number;
    resolved: number;
    this_week: number;
    prev_week: number;
    avg_hours: number;
  }>();
  return {
    total: Number(data?.total ?? 0),
    open: Number(data?.open_count ?? 0),
    resolved: Number(data?.resolved ?? 0),
    avg_resolution_hours: Number(data?.avg_hours ?? 0),
    this_week: Number(data?.this_week ?? 0),
    prev_week: Number(data?.prev_week ?? 0),
  };
}

export async function fetchCategoryBreakdown(
  cityId: string
): Promise<CategoryCount[]> {
  const db = createServerClient();
  const { data } = await db.rpc("city_category_breakdown", { _city_id: cityId });
  return (data ?? []).map((r: { category: ReportCategory; count: number }) => ({
    category: r.category,
    count: Number(r.count),
  }));
}

interface ViewRow {
  id: string;
  category: ReportCategory | null;
  severity: number | null;
  status: ReportStatus;
  address: string | null;
  lng: number | null;
  lat: number | null;
  photo_public_url: string;
  created_at: string;
  upvote_count: number | null;
  tags: string[] | null;
}

export async function fetchRecentReports(
  cityId: string,
  limit = 20
): Promise<DashboardReport[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("dashboard_reports_view")
    .select(
      "id, category, severity, status, address, lng, lat, photo_public_url, created_at, upvote_count, tags"
    )
    .eq("city_id", cityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as ViewRow[]).map((r) => ({
    id: r.id,
    category: (r.category ?? "other") as ReportCategory,
    severity: ((r.severity ?? 3) as 1 | 2 | 3 | 4 | 5),
    status: r.status,
    address: r.address ?? "Unknown location",
    location: { lng: r.lng ?? 0, lat: r.lat ?? 0 },
    photo_public_url: r.photo_public_url,
    created_at: r.created_at,
    // reporter_id is PII — stripped from the public view; placeholder satisfies the type.
    reporter_id: "",
    upvote_count: r.upvote_count ?? 0,
    tags: r.tags ?? [],
  }));
}

// Report IDs the current (logged-in) user has upvoted — for initial button state.
export async function fetchUserUpvotes(): Promise<string[]> {
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return [];
  const { data } = await ssr
    .from("report_upvotes")
    .select("report_id")
    .eq("user_id", user.id);
  return (data ?? []).map((r: { report_id: string }) => r.report_id);
}

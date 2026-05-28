import "server-only";
import { createServerClient } from "@/lib/db/client";
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
}

export async function fetchRecentReports(
  cityId: string,
  limit = 20
): Promise<DashboardReport[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("dashboard_reports_view")
    .select(
      "id, category, severity, status, address, lng, lat, photo_public_url, created_at"
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
  }));
}

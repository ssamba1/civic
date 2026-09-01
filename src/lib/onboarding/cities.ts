// Tenant directory reads for the admin console (F2, partial). Service-role so the
// admin list isn't constrained by per-city RLS. Selects only columns guaranteed
// by the base schema (migration 001) so this works before migration 015. Newer
// columns (setup_step, parent_id) are read separately once applied.

import { createServerClient } from "@/lib/db/client";

export interface CityListItem {
  id: string;
  slug: string;
  name: string;
  state: string;
  active: boolean;
  created_at: string;
}

export type CityStatus = "live" | "draft";

export function cityStatus(city: Pick<CityListItem, "active">): CityStatus {
  return city.active ? "live" : "draft";
}

export async function listCities(): Promise<CityListItem[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("cities")
    .select("id, slug, name, state, active, created_at")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as CityListItem[];
}

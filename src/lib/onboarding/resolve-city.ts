// Resolve a coordinate → owning city id via the city_for_point RPC (§6
// smallest-area containment, migration 015). Replaces the hardcoded 'cumming'
// default for resident city resolution. Never throws; returns null when no
// boundary contains the point (caller falls back to a default city).

import type { createServerClient } from "@/lib/db/client";

type SupabaseLike = ReturnType<typeof createServerClient>;

export async function resolveCityForPoint(
  db: SupabaseLike,
  lng: number,
  lat: number,
): Promise<string | null> {
  try {
    const { data, error } = await db.rpc("city_for_point", {
      _lng: lng,
      _lat: lat,
    });
    if (error) return null;
    // Scalar-returning RPC: data is the uuid string (or null when no match).
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

import "server-only";

import type { createServerClient } from "@/lib/db/client";

type ServiceClient = ReturnType<typeof createServerClient>;

/**
 * Resolve the jurisdiction that owns a report's work order (DA-02): the parent
 * city when the report's category is flagged escalates_to_parent and the city
 * has a parent_id, else the report's own city. Delegates to the
 * resolve_report_jurisdiction RPC (migration 034) so the geo/config logic lives
 * in one place.
 *
 * No-op-safe: on any error (un-migrated RPC included) it returns
 * `fallbackCityId` (the report's own city), so cross-jurisdiction routing
 * simply doesn't engage rather than breaking the pipeline.
 */
export async function resolveOwningCity(
  supabase: ServiceClient,
  reportId: string,
  fallbackCityId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("resolve_report_jurisdiction", {
      _report_id: reportId,
    });
    if (error || typeof data !== "string" || data.length === 0) {
      return fallbackCityId;
    }
    return data;
  } catch {
    return fallbackCityId;
  }
}

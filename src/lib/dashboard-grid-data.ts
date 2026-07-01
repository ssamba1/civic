import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[city-grid]");

/**
 * One row of the city work-order grid.
 *
 * Report-centric (FROM reports), NOT work-order-centric: emergency reports
 * short-circuit the classify pipeline before a work_orders row is created (and
 * merged reports never get one either), so a work-order-first query silently
 * hides the most urgent class of report. Here every classified report appears;
 * the work-order fields are simply null when no work order exists yet — which
 * surfaces the "emergency = dispatched, no priority/cost" reality instead of
 * burying it.
 */
export interface GridReportRow {
  report_id: string;
  category: string | null;
  subcategory: string | null;
  severity: number | null;
  is_emergency: boolean;
  /** Report status drives the Status column (work_orders has no status column). */
  status: string;
  address: string | null;
  photo_public_url: string | null;
  created_at: string;
  // ── work-order fields (null for emergency / merged / not-yet-dispatched) ──
  work_order_id: string | null;
  department: string | null;
  crew_type: string | null;
  priority_score: number | null;
  est_minutes: number | null;
  est_cost: number | null;
  wo_source: string | null;
  needs_manual_review: boolean;
}

/** Supabase embeds a to-one relation as either an object or a 1-element array
 *  depending on the relationship metadata — normalize both to a record. */
function firstOf(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null;
  return (v as Record<string, unknown>) ?? null;
}

/**
 * Fetch every classified report for a city with its (optional) work order and
 * classification flattened into one row. Ordered newest-first; the grid sorts
 * client-side (default Priority desc). On any query failure logs and returns []
 * so the dashboard tab degrades to an empty grid rather than 500-ing.
 */
export async function getGridRows(cityId: string): Promise<GridReportRow[]> {
  const db = createServerClient();

  const { data, error } = await db
    .from("reports")
    .select(
      `
      id,
      status,
      address,
      photo_public_url,
      created_at,
      classifications (
        category,
        subcategory,
        severity,
        is_emergency
      ),
      work_orders (
        id,
        department,
        crew_type,
        priority_score,
        est_minutes,
        est_cost,
        wo_source,
        needs_manual_review
      )
    `,
    )
    .eq("city_id", cityId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Grid rows fetch failed", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>): GridReportRow => {
    const cls = firstOf(row.classifications as Record<string, unknown>);
    const wo = firstOf(row.work_orders as Record<string, unknown>);

    return {
      report_id: row.id as string,
      category: (cls?.category as string) ?? null,
      subcategory: (cls?.subcategory as string) ?? null,
      severity: (cls?.severity as number) ?? null,
      is_emergency: Boolean(cls?.is_emergency),
      status: row.status as string,
      address: (row.address as string) ?? null,
      photo_public_url: (row.photo_public_url as string) ?? null,
      created_at: row.created_at as string,
      work_order_id: (wo?.id as string) ?? null,
      department: (wo?.department as string) ?? null,
      crew_type: (wo?.crew_type as string) ?? null,
      priority_score: (wo?.priority_score as number) ?? null,
      est_minutes: (wo?.est_minutes as number) ?? null,
      est_cost: (wo?.est_cost as number) ?? null,
      wo_source: (wo?.wo_source as string) ?? null,
      needs_manual_review: Boolean(wo?.needs_manual_review),
    };
  });
}

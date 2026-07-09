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
  /** AI-estimated hazard-zone radius in metres (classification signal, #27). */
  hazard_radius_m: number | null;
  /** Report status drives the Status column (work_orders has no status column). */
  status: string;
  address: string | null;
  photo_public_url: string | null;
  created_at: string;
  // ── work-order fields (null for emergency / merged / not-yet-dispatched) ──
  work_order_id: string | null;
  department: string | null;
  crew_type: string | null;
  /** Real crew assignment (crews table) — null until a staffer assigns one. */
  assigned_crew_id: string | null;
  assigned_crew_name: string | null;
  priority_score: number | null;
  est_minutes: number | null;
  est_cost: number | null;
  wo_source: string | null;
  needs_manual_review: boolean;
}

/** One assignable crew for the grid's crew control (no roster — the grid
 *  doesn't need names, just the unit). */
export interface GridCrewOption {
  id: string;
  name: string;
  teamKey: string;
  crewType: string | null;
}

/**
 * Active crews of a city for the grid's assignment dropdown. Degrades to []
 * on any failure (including the crews table not existing yet — migration 030),
 * so the grid renders without an assignment control rather than 500-ing.
 */
export async function getCityCrewOptions(
  cityId: string,
): Promise<GridCrewOption[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("crews")
    .select("id, name, team_key, crew_type")
    .eq("city_id", cityId)
    .eq("active", true)
    .order("team_key")
    .order("name");
  if (error) {
    logger.error("Crew options fetch failed", error);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      name: string;
      team_key: string;
      crew_type: string | null;
    }[]
  ).map((c) => ({
    id: c.id,
    name: c.name,
    teamKey: c.team_key,
    crewType: c.crew_type,
  }));
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
        is_emergency,
        hazard_radius_m
      ),
      work_orders (
        id,
        department,
        crew_type,
        assigned_crew_id,
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

  // Resolve assigned crew ids to names in JS rather than a PostgREST embed —
  // the embed needs the FK from migration 030, so it would hard-fail the whole
  // grid query on a database that hasn't applied it yet. This lookup just
  // degrades to null names.
  const crewNameById = new Map<string, string>();
  const { data: crewData, error: crewErr } = await db
    .from("crews")
    .select("id, name")
    .eq("city_id", cityId);
  if (crewErr) {
    logger.error("Crew names fetch failed", crewErr);
  } else {
    for (const c of (crewData ?? []) as { id: string; name: string }[])
      crewNameById.set(c.id, c.name);
  }

  return (data ?? []).map((row: Record<string, unknown>): GridReportRow => {
    const cls = firstOf(row.classifications as Record<string, unknown>);
    const wo = firstOf(row.work_orders as Record<string, unknown>);
    const assignedCrewId = (wo?.assigned_crew_id as string) ?? null;

    return {
      report_id: row.id as string,
      category: (cls?.category as string) ?? null,
      subcategory: (cls?.subcategory as string) ?? null,
      severity: (cls?.severity as number) ?? null,
      is_emergency: Boolean(cls?.is_emergency),
      hazard_radius_m:
        cls?.hazard_radius_m != null ? Number(cls.hazard_radius_m) : null,
      status: row.status as string,
      address: (row.address as string) ?? null,
      photo_public_url: (row.photo_public_url as string) ?? null,
      created_at: row.created_at as string,
      work_order_id: (wo?.id as string) ?? null,
      department: (wo?.department as string) ?? null,
      crew_type: (wo?.crew_type as string) ?? null,
      assigned_crew_id: assignedCrewId,
      assigned_crew_name: assignedCrewId
        ? (crewNameById.get(assignedCrewId) ?? null)
        : null,
      priority_score: (wo?.priority_score as number) ?? null,
      est_minutes: (wo?.est_minutes as number) ?? null,
      est_cost: (wo?.est_cost as number) ?? null,
      wo_source: (wo?.wo_source as string) ?? null,
      needs_manual_review: Boolean(wo?.needs_manual_review),
    };
  });
}

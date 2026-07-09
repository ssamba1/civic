import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-calendar");

/** One work order plotted on the staff calendar. */
export interface CalendarWorkOrder {
  id: string;
  // reports has no title column (see AGENTS.md schema) — address is the
  // closest human-readable field, same convention as lib/db/members.ts and
  // the Open311 accessors. Falls back to a placeholder when the reporter
  // left it blank.
  title: string;
  category: string | null; // from the joined 1:1 classifications row
  teamKey: string | null;
  crewType: string | null;
  crewId: string | null;
  crewName: string | null; // joined crews.name
  status: "open" | "completed";
  calendarDate: string; // ISO date (YYYY-MM-DD) it renders on
  dispatchedAt: string | null;
  completedAt: string | null;
  priorityScore: number | null;
}

// PostgREST rows come back untyped from the schema-less service client; this
// shape is the columns/embeds the query below selects, cast at the boundary.
//
// reports/crews are embedded FROM work_orders via work_orders' own FK columns
// (report_id, assigned_crew_id) — supabase-js's generic types infer these as
// arrays, but PostgREST always returns a single object/null for a child
// embedding its parent this way (same double-cast reasoning as
// lib/ai/crew-assign.ts's work_orders→reports embed).
//
// classifications is embedded the other direction (reports embeds its child
// classifications row) but report_id is UNIQUE on classifications, so
// PostgREST still collapses it to one row — except it may still come back as
// a single-element array depending on relationship detection, so this
// tolerates both shapes exactly like lib/db/members.ts's embeddedCategory.
type ClassificationsEmbed =
  | { category: string }[]
  | { category: string }
  | null;

interface CalendarWorkOrderRowRaw {
  id: string;
  team_key: string | null;
  crew_type: string | null;
  assigned_crew_id: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  created_at: string;
  priority_score: number | null;
  reports: {
    status: string;
    address: string | null;
    city_id: string;
    classifications: ClassificationsEmbed;
  } | null;
  crews: { name: string } | null;
}

// Reports in these statuses are dead — never real work, same reasoning as
// crew-assign.ts's DEAD_STATUSES (rejected/merged reports never get their
// work order completed_at stamped, and closed reports are done-and-archived).
const DEAD_STATUSES = new Set(["closed", "merged", "rejected"]);

// Widen the created_at fetch this far behind fromISO so a work order created
// well before the visible month, but dispatched into it, still gets pulled in
// before the client-side calendarDate filter narrows back to [fromISO, toISO).
const CREATED_AT_LOOKBACK_DAYS = 60;

function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function embeddedCategory(c: ClassificationsEmbed): string | null {
  if (!c) return null;
  const row = Array.isArray(c) ? c[0] : c;
  return row?.category ?? null;
}

/**
 * Work orders for one city over the calendar-visible window [fromISO, toISO)
 * (YYYY-MM-DD, end exclusive). `calendarDate` is `dispatched_at ?? created_at`
 * truncated to a date, computed client-side after a widened `created_at`
 * fetch — see CREATED_AT_LOOKBACK_DAYS. Excludes work orders whose report is
 * closed/merged/rejected. Service-role client — call only behind a staff
 * access gate. Never throws: any failure (un-migrated DB, query error,
 * unexpected row shape) returns [] so the calendar page still renders.
 */
export async function fetchCalendarWorkOrders(
  cityId: string,
  fromISO: string,
  toISO: string,
): Promise<CalendarWorkOrder[]> {
  try {
    const db = createServerClient();
    const widenedFrom = isoDaysBefore(fromISO, CREATED_AT_LOOKBACK_DAYS);

    const { data, error } = await db
      .from("work_orders")
      .select(
        "id, team_key, crew_type, assigned_crew_id, dispatched_at, completed_at, created_at, priority_score, reports!inner(status, address, city_id, classifications(category)), crews(name)",
      )
      .eq("reports.city_id", cityId)
      .gte("created_at", `${widenedFrom}T00:00:00.000Z`)
      .lt("created_at", `${toISO}T00:00:00.000Z`);

    if (error) {
      log.warn("calendar work orders query failed", {
        cityId,
        error: error.message,
      });
      return [];
    }

    const rows = (data ?? []) as unknown as CalendarWorkOrderRowRaw[];
    const out: CalendarWorkOrder[] = [];
    for (const r of rows) {
      const report = r.reports;
      if (!report) continue; // reports!inner guarantees this; defensive only
      if (DEAD_STATUSES.has(report.status)) continue;

      const calendarDate = (r.dispatched_at ?? r.created_at).slice(0, 10);
      if (calendarDate < fromISO || calendarDate >= toISO) continue;

      out.push({
        id: r.id,
        title: report.address ?? "Untitled report",
        category: embeddedCategory(report.classifications),
        teamKey: r.team_key,
        crewType: r.crew_type,
        crewId: r.assigned_crew_id,
        crewName: r.crews?.name ?? null,
        status: r.completed_at ? "completed" : "open",
        calendarDate,
        dispatchedAt: r.dispatched_at,
        completedAt: r.completed_at,
        priorityScore: r.priority_score,
      });
    }
    return out;
  } catch (err) {
    log.error("fetchCalendarWorkOrders threw", err, { cityId });
    return [];
  }
}

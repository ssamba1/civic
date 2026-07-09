"use server";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { normalizeLocation } from "@/lib/types";
import {
  optimizeRoute,
  routeStats,
} from "@/lib/staff/route-optimize";
import type { RouteStop, OrderedStop, RouteStats } from "@/lib/staff/route-optimize";
import type { Result } from "@/lib/types";

const logger = createLogger("[route-actions]");

// ---------------------------------------------------------------------------
// Auth guard — copied verbatim from schedule-actions.ts (same pattern as
// actions.ts). Do NOT import from actions.ts to avoid circular deps.
// ---------------------------------------------------------------------------

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

async function getStaffUser() {
  const user = await getAuthUser();
  const db = createServerClient();

  if (!user) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEV_AUTH_BYPASS === "1"
    ) {
      const { data: devStaff } = await db
        .from("users")
        .select("id, role, city_id")
        .in("role", [...STAFF_ROLES])
        .limit(1)
        .single();
      return devStaff && STAFF_ROLES.includes(devStaff.role) ? devStaff : null;
    }
    return null;
  }

  const { data: profile } = await db
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .single();

  if (!profile || !STAFF_ROLES.includes(profile.role)) return null;
  return profile;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrewRouteStop extends OrderedStop {
  workOrderId: string;
  category: string | null;
  status: string;
  scheduledFor: string;
}

export interface CrewRouteResult {
  crewId: string;
  date: string;
  stops: CrewRouteStop[];
  stats: RouteStats;
  twoOptApplied: boolean;
}

// ---------------------------------------------------------------------------
// Graceful-degrade probe
// ---------------------------------------------------------------------------

async function schedulingColumnsExist(
  db: ReturnType<typeof createServerClient>,
): Promise<boolean> {
  try {
    const { error } = await db
      .from("work_orders")
      .select("scheduled_for")
      .limit(0);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// getOptimizedRouteForCrew
// ---------------------------------------------------------------------------

/**
 * Fetch the crew's scheduled work orders for `date` (YYYY-MM-DD), join the
 * report location, then compute an efficient visit order via nearest-neighbour
 * + 2-opt and return the ordered list with per-leg distances.
 *
 * Graceful degrade: returns empty stops (no error) when:
 *  - DB migration 051 (scheduled_for) is not yet applied
 *  - The crew has no scheduled WOs for that day
 *  - The DB query fails (logged, error returned)
 */
export async function getOptimizedRouteForCrew(
  crewId: string,
  date: string,
): Promise<Result<CrewRouteResult>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "unauthorized" };

  // Validate date format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "invalid_date" };
  }

  const db = createServerClient();

  // Gracefully degrade on un-migrated DBs.
  if (!(await schedulingColumnsExist(db))) {
    logger.warn("getOptimizedRouteForCrew: migration 051 not applied", {
      crewId,
      date,
    });
    return {
      ok: true,
      data: {
        crewId,
        date,
        stops: [],
        stats: {
          stopCount: 0,
          totalMeters: 0,
          totalKm: 0,
          avgLegMeters: 0,
          longestLegMeters: 0,
          stopsWithoutLocation: 0,
        },
        twoOptApplied: false,
      },
    };
  }

  // City-scope guard: verify the crew belongs to the staffer's city.
  if (staff.city_id) {
    const { data: crew } = await db
      .from("crews")
      .select("id, city_id")
      .eq("id", crewId)
      .maybeSingle();
    if (!crew || crew.city_id !== staff.city_id) {
      return { ok: false, error: "crew_not_found" };
    }
  }

  // Fetch work orders for this crew on this date, joining reports for location.
  const { data, error } = await db
    .from("work_orders")
    .select(
      "id, scheduled_for, priority_score, reports!inner(id, address, location, status, city_id, classifications(category))",
    )
    .eq("assigned_crew_id", crewId)
    .gte("scheduled_for", `${date}T00:00:00.000Z`)
    .lte("scheduled_for", `${date}T23:59:59.999Z`)
    .order("scheduled_for");

  if (error) {
    logger.error("getOptimizedRouteForCrew query failed", error, {
      crewId,
      date,
    });
    return { ok: false, error: "db_error" };
  }

  if (!data || data.length === 0) {
    const empty: CrewRouteResult = {
      crewId,
      date,
      stops: [],
      stats: {
        stopCount: 0,
        totalMeters: 0,
        totalKm: 0,
        avgLegMeters: 0,
        longestLegMeters: 0,
        stopsWithoutLocation: 0,
      },
      twoOptApplied: false,
    };
    return { ok: true, data: empty };
  }

  // Normalize each row's PostGIS location.
  type WORow = {
    id: string;
    scheduled_for: string;
    priority_score: number | null;
    reports:
      | {
          id: string;
          address: string | null;
          location: unknown;
          status: string;
          city_id: string;
          classifications:
            | { category: string }
            | { category: string }[]
            | null;
        }
      | {
          id: string;
          address: string | null;
          location: unknown;
          status: string;
          city_id: string;
          classifications:
            | { category: string }
            | { category: string }[]
            | null;
        }[]
      | null;
  };

  const rows = data as unknown as WORow[];

  const stops: RouteStop[] = [];
  const metaMap = new Map<
    string,
    { workOrderId: string; category: string | null; status: string; scheduledFor: string }
  >();

  for (const row of rows) {
    const report = Array.isArray(row.reports) ? row.reports[0] : row.reports;
    if (!report) continue;

    const classifications = report.classifications;
    const cls = Array.isArray(classifications)
      ? classifications[0]
      : classifications;
    const category = cls?.category ?? null;

    // Use report.id as the route stop id so the caller can navigate to the report.
    const stopId = report.id;
    stops.push({
      id: stopId,
      address: report.address,
      location: normalizeLocation(report.location),
    });
    metaMap.set(stopId, {
      workOrderId: row.id,
      category,
      status: report.status,
      scheduledFor: row.scheduled_for,
    });
  }

  const { orderedStops, totalMeters, twoOptApplied } = optimizeRoute(stops);
  const stats = routeStats(orderedStops);

  const crewStops: CrewRouteStop[] = orderedStops.map((s) => {
    const m = metaMap.get(s.id);
    return {
      ...s,
      workOrderId: m?.workOrderId ?? "",
      category: m?.category ?? null,
      status: m?.status ?? "open",
      scheduledFor: m?.scheduledFor ?? "",
    };
  });

  return {
    ok: true,
    data: {
      crewId,
      date,
      stops: crewStops,
      stats,
      twoOptApplied,
    },
  };
}

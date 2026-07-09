import type { createServerClient } from "@/lib/db/client";
import type { createLogger } from "@/lib/logger";

type SupabaseLike = ReturnType<typeof createServerClient>;
type Logger = ReturnType<typeof createLogger>;

/** Fallback minutes when a work order has no est_minutes and the crew_type has
 *  no median to borrow (a cold DB with zero estimated work). */
export const DEFAULT_EST_MINUTES = 60;

/** One assignable crew, with the ranking signals the balancer uses. */
export interface CrewCandidate {
  id: string;
  name: string;
  memberCount: number;
  /** Count of the crew's OPEN work orders — the first load tie-break. */
  openWorkOrders: number;
  /** Sum of est_minutes across the crew's OPEN work orders (NULLs already
   *  resolved to the crew_type median / DEFAULT_EST_MINUTES by the caller). */
  openMinutes: number;
  /** Epoch ms of the crew's most recent assignment (max created_at of its open
   *  work orders), or null if it holds none — drives round-robin. */
  lastAssignedAt: number | null;
}

/** Per-capita workload: minutes of open work divided by crew size, so a bigger
 *  crew absorbs proportionally more before it looks "loaded". memberCount is
 *  floored at 1 — shells (0 members) are already deprioritized by the staffed
 *  gate below, so this only guards against a divide-by-zero, never reorders. */
function loadPerCapita(c: CrewCandidate): number {
  return c.openMinutes / Math.max(c.memberCount, 1);
}

/**
 * Deterministic crew pick — no model call. Ranking (argmin load):
 *   1. staffed crews before hollow shells (a shell is still assignable — the
 *      city created it precisely so work can route there before it's staffed —
 *      but a crew with people wins when one exists);
 *   2. lowest workload-hours ÷ crew size (real effort balanced by team size);
 *   3. fewest open work orders (spread raw count on a minutes tie);
 *   4. least-recently-assigned, i.e. smallest lastAssignedAt — null (never
 *      assigned) sorts first, giving idle crews the next job (round-robin);
 *   5. name (stable final tie-break so re-runs pick the same crew).
 */
export function pickCrew(candidates: CrewCandidate[]): CrewCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const aStaffed = a.memberCount > 0;
    const bStaffed = b.memberCount > 0;
    if (aStaffed !== bStaffed) return aStaffed ? -1 : 1;

    const loadA = loadPerCapita(a);
    const loadB = loadPerCapita(b);
    if (loadA !== loadB) return loadA - loadB;

    if (a.openWorkOrders !== b.openWorkOrders)
      return a.openWorkOrders - b.openWorkOrders;

    // null = never assigned, sorts before any timestamp (round-robin: the
    // crew idle longest is next). Number.NEGATIVE_INFINITY models "never".
    const lastA = a.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
    const lastB = b.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
    if (lastA !== lastB) return lastA - lastB;

    return a.name.localeCompare(b.name);
  });
  return sorted[0];
}

/**
 * Auto-assign a crew to a freshly created work order (AI_CREW_ASSIGN flag).
 *
 * Candidates: the city's ACTIVE crews in the work order's division whose
 * crew_type equals the work order's crew_type — strict match, because the
 * type is the semantic contract between the AI pick and the org chart. No
 * match → no assignment (staff assign manually, exactly as before).
 *
 * Best-effort by design, mirroring the team_key stamp: any failure logs and
 * returns null, never throws — the pipeline must not break on an un-migrated
 * DB or a transient query error. The final UPDATE is guarded with
 * `.is("assigned_crew_id", null)` so a re-run (pipeline is idempotent via
 * upsert) never clobbers an assignment staff already made.
 *
 * `crewHint` (AI crew_hint, from the crews' own descriptions): when it names
 * one of the candidates — case-insensitive exact name match — that crew wins
 * outright and the load ranking is skipped. Any other value (hallucinated,
 * stale, cross-division) is ignored and logged; routing quality can degrade,
 * assignment correctness cannot.
 */
export async function autoAssignCrew(
  supabase: SupabaseLike,
  opts: {
    workOrderId: string;
    cityId: string;
    teamKey: string;
    crewType: string;
    crewHint?: string | null;
    log: Logger;
  },
): Promise<string | null> {
  const { workOrderId, cityId, teamKey, crewType, crewHint, log } = opts;
  try {
    const { data: crewData, error: crewErr } = await supabase
      .from("crews")
      .select("id, name")
      .eq("city_id", cityId)
      .eq("team_key", teamKey)
      .eq("crew_type", crewType)
      .eq("active", true);
    if (crewErr) {
      log.warn("crew_auto_assign_query_failed", {
        workOrderId,
        error: crewErr.message,
      });
      return null;
    }
    const crews = (crewData ?? []) as { id: string; name: string }[];
    if (crews.length === 0) return null;

    // AI hint first: an exact (case-insensitive) name match among the
    // candidates ends the search — the model chose from these very crews'
    // descriptions, so its pick outranks the load heuristic. No match →
    // ignore the hint and rank as usual.
    const hint = crewHint?.trim().toLowerCase();
    let chosen: { id: string; name: string } | null = null;
    if (hint) {
      chosen = crews.find((c) => c.name.trim().toLowerCase() === hint) ?? null;
      if (!chosen) {
        log.warn("crew_auto_assign_hint_miss", { workOrderId, crewHint });
      }
    }

    if (!chosen) {
      const crewIds = crews.map((c) => c.id);

      // Roster sizes — a hollow shell has zero rows here.
      const memberCounts = new Map<string, number>();
      const { data: memberData, error: memberErr } = await supabase
        .from("crew_members")
        .select("crew_id")
        .in("crew_id", crewIds);
      if (memberErr) {
        log.warn("crew_auto_assign_members_failed", {
          workOrderId,
          error: memberErr.message,
        });
      }
      for (const m of (memberData ?? []) as { crew_id: string }[]) {
        memberCounts.set(m.crew_id, (memberCounts.get(m.crew_id) ?? 0) + 1);
      }

      // Current load — open (not yet completed) work orders per crew. The
      // report status join matters: rejected/merged reports never get their
      // work order completed_at stamped, so completed_at alone would count
      // dead work forever and permanently skew the ranking. est_minutes drives
      // the workload-hours side of the balancer; created_at is the recency
      // signal for the round-robin tie-break.
      const openCounts = new Map<string, number>();
      const openMinutes = new Map<string, number>();
      const lastAssignedAt = new Map<string, number>();
      const { data: woData, error: woErr } = await supabase
        .from("work_orders")
        .select("assigned_crew_id, est_minutes, created_at, reports(status)")
        .in("assigned_crew_id", crewIds)
        .is("completed_at", null);
      if (woErr) {
        log.warn("crew_auto_assign_load_failed", {
          workOrderId,
          error: woErr.message,
        });
      }
      const DEAD_STATUSES = new Set(["closed", "merged", "rejected"]);
      // Double cast: supabase-js infers the reports embed as an array, but the
      // work_orders→reports FK is many-to-one so PostgREST returns an object.
      const liveOrders = ((woData ?? []) as unknown as {
        assigned_crew_id: string | null;
        est_minutes: number | null;
        created_at: string | null;
        reports: { status: string } | null;
      }[]).filter(
        (w) =>
          w.assigned_crew_id &&
          !(w.reports && DEAD_STATUSES.has(w.reports.status)),
      );

      // NULL est_minutes borrows the median of the estimated open work in this
      // candidate set (same crew_type + division), falling back to a fixed
      // default when nothing is estimated yet — so an un-estimated order still
      // contributes realistic load instead of zero.
      const estimated = liveOrders
        .map((w) => w.est_minutes)
        .filter((m): m is number => m != null && m > 0)
        .sort((a, b) => a - b);
      const median =
        estimated.length > 0
          ? estimated[Math.floor((estimated.length - 1) / 2)]
          : DEFAULT_EST_MINUTES;

      for (const w of liveOrders) {
        const crewId = w.assigned_crew_id as string;
        openCounts.set(crewId, (openCounts.get(crewId) ?? 0) + 1);
        const minutes = w.est_minutes != null && w.est_minutes > 0 ? w.est_minutes : median;
        openMinutes.set(crewId, (openMinutes.get(crewId) ?? 0) + minutes);
        const ts = w.created_at ? Date.parse(w.created_at) : NaN;
        if (!Number.isNaN(ts)) {
          lastAssignedAt.set(
            crewId,
            Math.max(lastAssignedAt.get(crewId) ?? Number.NEGATIVE_INFINITY, ts),
          );
        }
      }

      const candidates: CrewCandidate[] = crews.map((c) => ({
        id: c.id,
        name: c.name,
        memberCount: memberCounts.get(c.id) ?? 0,
        openWorkOrders: openCounts.get(c.id) ?? 0,
        openMinutes: openMinutes.get(c.id) ?? 0,
        lastAssignedAt: lastAssignedAt.get(c.id) ?? null,
      }));
      const picked = pickCrew(candidates);
      if (!picked) return null;
      chosen = { id: picked.id, name: picked.name };

      // Observability: the load inputs behind the pick, for balancer tuning.
      log.info("crew_auto_assign_loads", {
        workOrderId,
        crewType,
        candidates: candidates.map((c) => ({
          id: c.id,
          members: c.memberCount,
          openWorkOrders: c.openWorkOrders,
          openMinutes: c.openMinutes,
          loadPerCapita: c.openMinutes / Math.max(c.memberCount, 1),
        })),
      });
    }

    const { error: updateErr } = await supabase
      .from("work_orders")
      .update({ assigned_crew_id: chosen.id })
      .eq("id", workOrderId)
      .is("assigned_crew_id", null);
    if (updateErr) {
      log.warn("crew_auto_assign_update_failed", {
        workOrderId,
        crewId: chosen.id,
        error: updateErr.message,
      });
      return null;
    }

    log.info("crew_auto_assigned", {
      workOrderId,
      crewId: chosen.id,
      crewName: chosen.name,
      crewType,
      teamKey,
      viaHint: Boolean(hint && chosen.name.trim().toLowerCase() === hint),
    });
    return chosen.id;
  } catch (err) {
    log.warn("crew_auto_assign_threw", {
      workOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

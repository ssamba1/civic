import type { createServerClient } from "@/lib/db/client";
import type { createLogger } from "@/lib/logger";

type SupabaseLike = ReturnType<typeof createServerClient>;
type Logger = ReturnType<typeof createLogger>;

/* ==================================================================
   Advanced routing over the org_units tree (migration 042).

   Two pure stages + one DB wrapper:

     resolveCandidates()  tree → assignable LEAF units valid for a report
     assignBestUnit()     candidates → the single best pick (cost/SLA/load)
     autoAssignUnit()     DB: load the tree, count live load, assign, stamp

   Pure stages take plain data so they are exhaustively unit-tested without a
   database. The DB wrapper mirrors autoAssignCrew (030): best-effort, never
   throws, and the final UPDATE is guarded so a pipeline re-run never clobbers
   an assignment staff already made.
   ================================================================== */

/** A node of the org tree as stored in org_units. */
export interface OrgUnit {
  id: string;
  parentId: string | null;
  kind: "team" | "subteam" | "crew" | "contractor";
  /** Accepted report categories; null = inherit from nearest ancestor that sets it. */
  categories: string[] | null;
  /** crew_type keys this unit can perform. */
  skills: string[];
  isContractor: boolean;
  /** Max concurrent open work orders; null = unbounded. */
  capacity: number | null;
  /** Marginal per-job cost; null/0 = internal. */
  costPerJob: number | null;
  /** Expected turnaround hours; null = unknown. */
  slaHours: number | null;
  active: boolean;
}

/** A leaf unit plus the live load signal, ready to be scored. */
export interface AssignCandidate extends OrgUnit {
  /** Open (not completed) work orders currently on this unit. */
  openWorkOrders: number;
}

/** Per-city tuning of the load-balance objective. Weights need not sum to 1. */
export interface RoutingWeights {
  /** Fill = openWorkOrders / capacity. Higher weight = spread load harder. */
  load: number;
  /** Normalized cost_per_job. Higher weight = prefer cheaper (internal) units. */
  cost: number;
  /** SLA-breach risk if assigned. Higher weight = avoid units that miss due_at. */
  sla: number;
  /** Skill-match strength bonus (subtracted from score). */
  skill: number;
}

/**
 * Cost/SLA-weighted default (the chosen policy). Load, cost and SLA share the
 * weight so a contractor (cost > 0) only wins once internal crews are filling
 * up OR when it is materially faster on an at-risk work order — internal
 * spillover as an emergent property, not a hard rule.
 */
export const DEFAULT_WEIGHTS: RoutingWeights = {
  load: 0.3,
  cost: 0.3,
  sla: 0.3,
  skill: 0.1,
};

/**
 * Resolve a unit's effective categories by walking up to the nearest ancestor
 * that sets a non-null `categories`. A subteam with null categories inherits
 * its parent team's scope.
 */
export function effectiveCategories(
  unit: OrgUnit,
  byId: Map<string, OrgUnit>,
): string[] {
  let cur: OrgUnit | undefined = unit;
  const seen = new Set<string>();
  while (cur) {
    if (cur.categories !== null) return cur.categories;
    if (seen.has(cur.id)) break; // cycle guard (should never happen)
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return []; // no ancestor scopes it → accepts nothing
}

/**
 * Prune the tree to the assignable LEAF units valid for a report:
 *   - active,
 *   - a leaf (no active children — only leaves take work),
 *   - the report's category is in its (inherited) categories,
 *   - when a crewType is given, it is in the unit's skills (a unit with empty
 *     skills is a wildcard — it accepts any crew_type, matching a generic crew).
 *
 * Pure: `units` is the full active set for one city. Returns candidates with
 * openWorkOrders defaulted to 0 (the DB wrapper fills real load in).
 */
export function resolveCandidates(
  units: OrgUnit[],
  category: string,
  crewType: string | null,
): AssignCandidate[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const hasActiveChild = new Set<string>();
  for (const u of units) {
    if (u.active && u.parentId) hasActiveChild.add(u.parentId);
  }

  const out: AssignCandidate[] = [];
  for (const u of units) {
    if (!u.active) continue;
    if (hasActiveChild.has(u.id)) continue; // not a leaf
    if (!effectiveCategories(u, byId).includes(category)) continue;
    if (crewType && u.skills.length > 0 && !u.skills.includes(crewType))
      continue;
    out.push({ ...u, openWorkOrders: 0 });
  }
  return out;
}

/**
 * Score one candidate — LOWER is better. Terms, each normalized to ~[0,1] so
 * the weights are comparable:
 *   load  = fill (open / capacity); unbounded capacity uses a soft cap so
 *           adding work still costs something and load still spreads.
 *   cost  = costPerJob / maxCost across the candidate set (internal ≈ 0).
 *   sla   = breach risk in [0,1]: does this unit's turnaround blow the deadline?
 *   skill = exact crew_type match subtracts a bonus (a wildcard unit gets none).
 */
export function scoreUnit(
  c: AssignCandidate,
  ctx: {
    maxCost: number;
    /** Hours remaining until due_at; null = no deadline pressure. */
    hoursToDue: number | null;
    crewType: string | null;
    weights: RoutingWeights;
    /** Soft capacity for unbounded units, so fill is never a flat 0. */
    softCap: number;
  },
): number {
  const cap = c.capacity ?? ctx.softCap;
  const fill = Math.min(1, c.openWorkOrders / Math.max(1, cap));

  const cost = ctx.maxCost > 0 ? (c.costPerJob ?? 0) / ctx.maxCost : 0;

  // SLA breach risk in [0,1]: the fraction of the unit's own turnaround that
  // overshoots the time remaining. A unit that comfortably beats the deadline
  // (slaHours <= hoursToDue) scores 0; a slower unit scores higher, and this
  // stays graded even when several units all breach (normalizing by the unit's
  // slaHours, not by the shared hoursToDue, avoids everyone saturating at 1).
  // No due_at or no sla_hours → no signal (0).
  let sla = 0;
  if (ctx.hoursToDue !== null && c.slaHours !== null) {
    if (ctx.hoursToDue <= 0)
      sla = 1; // already overdue: any delay is a breach
    else sla = Math.min(1, Math.max(0, 1 - ctx.hoursToDue / c.slaHours));
  }

  // Skill bonus: an exact crew_type match is better than a wildcard fallback.
  const skillBonus = ctx.crewType && c.skills.includes(ctx.crewType) ? 1 : 0;

  const w = ctx.weights;
  return w.load * fill + w.cost * cost + w.sla * sla - w.skill * skillBonus;
}

/**
 * Pick the best candidate — min score after hard filters. Hard filters:
 *   - a bounded unit at/over capacity is out (never overfill),
 * then rank by score, tie-break on id for a stable, reproducible pick.
 *
 * Returns null when every candidate is filtered out (all at capacity) or the
 * list is empty — caller leaves the work order unassigned for manual dispatch.
 */
export function assignBestUnit(
  candidates: AssignCandidate[],
  opts: {
    hoursToDue?: number | null;
    crewType?: string | null;
    weights?: RoutingWeights;
    softCap?: number;
  } = {},
): AssignCandidate | null {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const softCap = opts.softCap ?? 10;
  const crewType = opts.crewType ?? null;
  const hoursToDue = opts.hoursToDue ?? null;

  const eligible = candidates.filter(
    (c) => c.capacity === null || c.openWorkOrders < c.capacity,
  );
  if (eligible.length === 0) return null;

  const maxCost = eligible.reduce((m, c) => Math.max(m, c.costPerJob ?? 0), 0);

  let best: AssignCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of eligible) {
    const s = scoreUnit(c, { maxCost, hoursToDue, crewType, weights, softCap });
    if (s < bestScore || (s === bestScore && best && c.id < best.id)) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/**
 * Persist an APPROVED org-tree proposal for a city (advanced routing 042).
 * Inserts in dependency order — a node's parent is inserted first so its DB id
 * is known — because org_units.parent_id is a real FK and the path trigger
 * looks up the parent's path at insert time. Returns the key → new id map.
 *
 * `proposalUnits` is the human-approved flat list (validated upstream by
 * validateTreeShape). Idempotency is the caller's concern: this appends units;
 * it does not reconcile against an existing tree.
 */
export async function persistOrgTree(
  supabase: SupabaseLike,
  cityId: string,
  proposalUnits: Array<{
    key: string;
    label: string;
    kind: OrgUnit["kind"];
    parentKey: string | null;
    categories: string[] | null;
    skills: string[];
    isContractor: boolean;
    capacity: number | null;
    costPerJob: number | null;
    slaHours: number | null;
  }>,
): Promise<
  { ok: true; idByKey: Record<string, string> } | { ok: false; error: string }
> {
  const idByKey: Record<string, string> = {};
  const inserted = new Set<string>();

  // Topological order: repeatedly insert every unit whose parent is a root or
  // already inserted. Bounded by unit count; a leftover means an unresolved /
  // cyclic parentKey (should have been caught by validateTreeShape).
  let progress = true;
  while (inserted.size < proposalUnits.length && progress) {
    progress = false;
    for (const u of proposalUnits) {
      if (inserted.has(u.key)) continue;
      if (u.parentKey !== null && !inserted.has(u.parentKey)) continue;
      const parentId = u.parentKey ? idByKey[u.parentKey] : null;
      const { data, error } = await supabase
        .from("org_units")
        .insert({
          city_id: cityId,
          parent_id: parentId,
          kind: u.kind,
          key: u.key,
          label: u.label,
          categories: u.categories,
          skills: u.skills,
          is_contractor: u.isContractor,
          capacity: u.capacity,
          cost_per_job: u.costPerJob,
          sla_hours: u.slaHours,
        })
        .select("id")
        .single();
      if (error || !data) {
        return {
          ok: false,
          error: `insert ${u.key} failed: ${error?.message ?? "no row"}`,
        };
      }
      idByKey[u.key] = (data as { id: string }).id;
      inserted.add(u.key);
      progress = true;
    }
  }

  if (inserted.size < proposalUnits.length) {
    const stuck = proposalUnits
      .filter((u) => !inserted.has(u.key))
      .map((u) => u.key);
    return { ok: false, error: `unresolved parent chain: ${stuck.join(", ")}` };
  }
  return { ok: true, idByKey };
}

/** Map a raw org_units row (snake_case) to the OrgUnit shape. */
function rowToUnit(r: Record<string, unknown>): OrgUnit {
  return {
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    kind: r.kind as OrgUnit["kind"],
    categories: (r.categories as string[] | null) ?? null,
    skills: (r.skills as string[] | null) ?? [],
    isContractor: Boolean(r.is_contractor),
    capacity: (r.capacity as number | null) ?? null,
    costPerJob: (r.cost_per_job as number | null) ?? null,
    slaHours: (r.sla_hours as number | null) ?? null,
    active: Boolean(r.active),
  };
}

/**
 * Auto-assign the best org unit to a freshly created work order (042 successor
 * to autoAssignCrew). Best-effort: any failure logs and returns null, never
 * throws — the pipeline must survive an un-migrated DB or a transient error.
 * The UPDATE is guarded with `.is("assigned_unit_id", null)` so a re-run never
 * overwrites a manual assignment.
 */
export async function autoAssignUnit(
  supabase: SupabaseLike,
  opts: {
    workOrderId: string;
    cityId: string;
    category: string;
    crewType: string | null;
    /** work_orders.due_at (ISO) if stamped, for SLA-risk scoring. */
    dueAt?: string | null;
    /** Server "now" epoch ms — passed in for testability / determinism. */
    nowMs: number;
    weights?: RoutingWeights;
    log: Logger;
  },
): Promise<string | null> {
  const { workOrderId, cityId, category, crewType, dueAt, nowMs, log } = opts;
  try {
    const { data: unitRows, error: unitErr } = await supabase
      .from("org_units")
      .select(
        "id, parent_id, kind, categories, skills, is_contractor, capacity, cost_per_job, sla_hours, active",
      )
      .eq("city_id", cityId);
    if (unitErr) {
      log.warn("unit_auto_assign_query_failed", {
        workOrderId,
        error: unitErr.message,
      });
      return null;
    }
    const units = ((unitRows ?? []) as Record<string, unknown>[]).map(
      rowToUnit,
    );
    const candidates = resolveCandidates(units, category, crewType);
    if (candidates.length === 0) return null;

    // Live load: open (not completed) work orders per candidate unit. Mirror
    // the crew load query (030) — exclude dead reports so rejected/merged work
    // never permanently skews a unit's fill.
    const ids = candidates.map((c) => c.id);
    const openCounts = new Map<string, number>();
    const { data: woData, error: woErr } = await supabase
      .from("work_orders")
      .select("assigned_unit_id, reports(status)")
      .in("assigned_unit_id", ids)
      .is("completed_at", null);
    if (woErr) {
      log.warn("unit_auto_assign_load_failed", {
        workOrderId,
        error: woErr.message,
      });
    }
    const DEAD_STATUSES = new Set(["closed", "merged", "rejected"]);
    for (const w of (woData ?? []) as unknown as {
      assigned_unit_id: string | null;
      reports: { status: string } | null;
    }[]) {
      if (!w.assigned_unit_id) continue;
      if (w.reports && DEAD_STATUSES.has(w.reports.status)) continue;
      openCounts.set(
        w.assigned_unit_id,
        (openCounts.get(w.assigned_unit_id) ?? 0) + 1,
      );
    }
    for (const c of candidates) {
      c.openWorkOrders = openCounts.get(c.id) ?? 0;
    }

    const hoursToDue = dueAt
      ? (new Date(dueAt).getTime() - nowMs) / 3_600_000
      : null;

    const chosen = assignBestUnit(candidates, {
      hoursToDue,
      crewType,
      weights: opts.weights,
    });
    if (!chosen) return null;

    const { error: updateErr } = await supabase
      .from("work_orders")
      .update({ assigned_unit_id: chosen.id })
      .eq("id", workOrderId)
      .is("assigned_unit_id", null);
    if (updateErr) {
      log.warn("unit_auto_assign_update_failed", {
        workOrderId,
        unitId: chosen.id,
        error: updateErr.message,
      });
      return null;
    }

    log.info("unit_auto_assigned", {
      workOrderId,
      unitId: chosen.id,
      kind: chosen.kind,
      isContractor: chosen.isContractor,
      openWorkOrders: chosen.openWorkOrders,
      crewType,
      category,
    });
    return chosen.id;
  } catch (err) {
    log.warn("unit_auto_assign_threw", {
      workOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

import { createServerClient } from "@/lib/db/client";
import { fetchActiveCrewTypeDefs } from "@/lib/db/crew-types";
import { fetchCrewWorkloads } from "@/lib/db/crew-workloads";
import { fetchCityCrews } from "@/lib/db/crews";
import {
  buildCategoryTeamDisplay,
  fetchCityTeams,
} from "@/lib/onboarding/city-teams";
import { ALL_CATEGORIES, categoryLabel } from "@/lib/onboarding/presets";
import { TEAM_LIST } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Routing flow view — data loader.

   One read-only snapshot of how a report travels through this city's
   routing pipeline, shaped for the flow-chart renderer:

     photo → AI classify → category → division (city_teams or static
     TEAMS default) → crew (autoAssignCrew), or — when the city has an
     org_units tree (042) — the weighted unit assignment instead.

   Everything is best-effort: a missing table / un-migrated DB degrades
   to the static defaults, never throws. This module only READS; the
   actual routing decisions live in lib/ai/crew-assign.ts and
   lib/routing/org-units.ts.
   ================================================================== */

export interface FlowCategory {
  key: ReportCategory;
  label: string;
  /** Owning division under the city's live routing config. */
  teamKey: string;
}

export interface FlowTeam {
  key: string;
  label: string;
  color: string;
  categories: ReportCategory[];
}

export interface FlowCrew {
  id: string;
  teamKey: string;
  name: string;
  crewType: string | null;
  crewTypeLabel: string | null;
  memberCount: number;
  /** Open (backlog) work orders currently on this crew. */
  openCount: number;
}

export interface FlowUnit {
  id: string;
  parentId: string | null;
  kind: "team" | "subteam" | "crew" | "contractor";
  /** Stable slug (often a TeamId for roots — the flow view colors by it). */
  key: string;
  label: string;
  /** Declared categories; null = inherits from nearest ancestor. */
  categories: string[] | null;
  skills: string[];
  capacity: number | null;
  costPerJob: number | null;
  slaHours: number | null;
  isContractor: boolean;
}

export interface RoutingFlowData {
  categories: FlowCategory[];
  teams: FlowTeam[];
  crews: FlowCrew[];
  /** Active org_units rows (042 advanced routing); empty on legacy cities. */
  units: FlowUnit[];
  /** True when the org_units tree can actually route (≥1 leaf resolves a
   *  non-empty category set) — then it is the authoritative flow. */
  hasOrgTree: boolean;
  /** Units exist but every leaf resolves to zero categories ("accepts
   *  nothing" per effectiveCategories) — tree is configured yet inert, and
   *  routing falls through to the legacy division → crew pick. */
  orgTreeInert: boolean;
}

/** Does at least one LEAF unit resolve a non-empty category set? Mirrors
 *  lib/routing/org-units.ts effectiveCategories: null inherits from the
 *  nearest ancestor; all-null (or declared-empty) chains accept nothing. */
function orgTreeRoutes(units: FlowUnit[]): boolean {
  const byId = new Map(units.map((u) => [u.id, u]));
  const hasChild = new Set(
    units.filter((u) => u.parentId !== null).map((u) => u.parentId as string),
  );
  return units.some((leaf) => {
    if (hasChild.has(leaf.id)) return false; // only leaves take work
    let cur: FlowUnit | undefined = leaf;
    const seen = new Set<string>();
    while (cur) {
      if (cur.categories !== null) return cur.categories.length > 0;
      if (seen.has(cur.id)) break; // cycle guard
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  });
}

/** Active org_units for a city; [] on any failure (incl. pre-042 DBs). */
async function fetchOrgUnits(cityId: string): Promise<FlowUnit[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("org_units")
      .select(
        "id, parent_id, kind, key, label, categories, skills, is_contractor, capacity, cost_per_job, sla_hours, active",
      )
      .eq("city_id", cityId)
      .eq("active", true);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      parentId: (r.parent_id as string | null) ?? null,
      kind: r.kind as FlowUnit["kind"],
      key: (r.key as string | null) ?? "",
      label: r.label as string,
      categories: (r.categories as string[] | null) ?? null,
      skills: (r.skills as string[] | null) ?? [],
      capacity: (r.capacity as number | null) ?? null,
      costPerJob: (r.cost_per_job as number | null) ?? null,
      slaHours: (r.sla_hours as number | null) ?? null,
      isContractor: Boolean(r.is_contractor),
    }));
  } catch {
    return [];
  }
}

/**
 * Snapshot the routing pipeline for one city. `cityId` null (a known-cities
 * mock slug with no DB row) renders the static preset routing with no crews —
 * the flow chart still shows the category → division stage honestly.
 */
export async function fetchRoutingFlowData(
  cityId: string | null,
): Promise<RoutingFlowData> {
  const config = cityId ? await fetchCityTeams(cityId) : [];
  const display = buildCategoryTeamDisplay(config);

  const categories: FlowCategory[] = ALL_CATEGORIES.map((key) => ({
    key,
    label: categoryLabel(key),
    teamKey: display[key]?.teamKey ?? "general_admin",
  }));

  // Divisions in canonical TEAM_LIST order, each with the categories the live
  // config routes to it. Teams that own zero categories are added later only
  // if a crew references them — an empty division with no crews is noise.
  const teamOrder = TEAM_LIST.filter((t) => t.id !== "all").map((t) => t.id);
  const teamMap = new Map<string, FlowTeam>();
  for (const c of categories) {
    const d = display[c.key];
    if (!d) continue;
    const existing = teamMap.get(d.teamKey);
    if (existing) {
      existing.categories.push(c.key);
    } else {
      teamMap.set(d.teamKey, {
        key: d.teamKey,
        label: d.label,
        color: d.color,
        categories: [c.key],
      });
    }
  }

  let crews: FlowCrew[] = [];
  let units: FlowUnit[] = [];
  if (cityId) {
    const [crewsResult, workloadsResult, typeDefs, orgUnits] =
      await Promise.all([
        fetchCityCrews(cityId),
        fetchCrewWorkloads(cityId),
        fetchActiveCrewTypeDefs(cityId),
        fetchOrgUnits(cityId),
      ]);
    units = orgUnits;

    if (crewsResult.ok) {
      const workloads = workloadsResult.ok ? workloadsResult.workloads : {};
      const typeLabel = new Map(typeDefs.map((t) => [t.key, t.label]));
      crews = crewsResult.crews
        .filter((c) => c.active)
        .map((c) => ({
          id: c.id,
          teamKey: c.teamKey,
          name: c.name,
          crewType: c.crewType,
          crewTypeLabel: c.crewType
            ? (typeLabel.get(c.crewType) ?? c.crewType.replace(/_/g, " "))
            : null,
          memberCount: c.members.length,
          openCount: workloads[c.id]?.openCount ?? 0,
        }));
    }
  }

  // A crew can point at a division that owns no categories (routing was
  // reconfigured after the crew was created). Surface the division anyway so
  // the crew is never orphaned off-chart.
  for (const crew of crews) {
    if (teamMap.has(crew.teamKey)) continue;
    const meta = TEAM_LIST.find((t) => t.id === crew.teamKey);
    teamMap.set(crew.teamKey, {
      key: crew.teamKey,
      label: meta?.shortLabel ?? crew.teamKey.replace(/_/g, " "),
      color: meta?.color ?? "#9a9aa0",
      categories: [],
    });
  }

  const teams = [...teamMap.values()].sort((a, b) => {
    const ai = teamOrder.indexOf(a.key as (typeof teamOrder)[number]);
    const bi = teamOrder.indexOf(b.key as (typeof teamOrder)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const routes = units.length > 0 && orgTreeRoutes(units);
  return {
    categories,
    teams,
    crews,
    units,
    hasOrgTree: routes,
    orgTreeInert: units.length > 0 && !routes,
  };
}

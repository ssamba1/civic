import { getCategoryOverridesSnapshot } from "@/lib/category-overrides";
import type { ReportCategory } from "@/lib/types";

/* ------------------------------------------------------------------
   Team palette: 10 chromatic identities generated in OKLCH at a constant
   L=0.63 with C = min(0.185, 90% of the in-gamut maximum for that hue), so
   no single team out-shouts the rest while each stays vivid enough to read
   as a 6px dot on both --surface values (#fff / #101012). Hues keep their
   semantic anchor (water=cyan, stormwater=blue, parks=green, lighting=gold).
   Code Enforcement is the one reassignment: it had no meaningful hue (near-
   grey #b6b6bc, indistinguishable from All Teams and General Admin), so it
   took the open teal slot. All Teams and General Admin stay deliberately
   neutral (aggregate / triage) and are separated by lightness, not hue.
   Used as TEXT anywhere? Mix toward --team-text-mix (see globals.css) —
   the raw hues sit at ~3.3-3.9:1 on white, which is graphic-only contrast.

   Civil teams — based on US municipal department research.
   Each team owns specific report categories and auto-receives reports
   matching their assigned categories via categoryToTeam().
   ------------------------------------------------------------------ */

export type TeamId =
  | "all"
  | "streets_roads"
  | "sidewalks_ada"
  | "stormwater"
  | "water_utilities"
  | "street_lighting"
  | "traffic_engineering"
  | "parks_forestry"
  | "graffiti_abatement"
  | "code_enforcement"
  | "environmental_services"
  | "general_admin";

export interface TeamMeta {
  id: TeamId;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  duties: string;
  categories: ReportCategory[];
}

export const TEAMS: Record<TeamId, TeamMeta> = {
  all: {
    id: "all",
    label: "All Teams (Admin View)",
    shortLabel: "All Teams",
    color: "#91919b",
    icon: "users",
    duties: "Citywide oversight across every department.",
    categories: [],
  },
  streets_roads: {
    id: "streets_roads",
    label: "Streets & Roads Division",
    shortLabel: "Streets & Roads",
    color: "#e35044",
    icon: "construction",
    duties:
      "Pothole repair, milling, repaving, full street reconstruction. Curb/gutter, lane markings, asphalt and concrete maintenance.",
    categories: ["pothole"],
  },
  sidewalks_ada: {
    id: "sidewalks_ada",
    label: "Sidewalk & ADA Compliance Division",
    shortLabel: "Sidewalks & ADA",
    color: "#c57124",
    icon: "footprints",
    duties:
      "Sidewalk repair and replacement. Curb ramp installation and upgrades. ADA accessibility audits and trip hazard remediation.",
    categories: ["sidewalk_damage"],
  },
  stormwater: {
    id: "stormwater",
    label: "Stormwater / Drainage Division",
    shortLabel: "Stormwater",
    color: "#5082f4",
    icon: "waves",
    duties:
      "Catch basin cleaning, storm pipe maintenance, flood mitigation. 24/7 emergency response to localized flooding and stormwater pollution.",
    categories: ["drainage"],
  },
  water_utilities: {
    id: "water_utilities",
    label: "Water & Utilities Division",
    shortLabel: "Water & Utilities",
    color: "#2995c0",
    icon: "droplets",
    duties:
      "Water main breaks, leak detection, fire hydrant maintenance. Potable and reclaimed water distribution systems.",
    categories: ["water_leak"],
  },
  street_lighting: {
    id: "street_lighting",
    label: "Street Lighting Division",
    shortLabel: "Street Lighting",
    color: "#a48525",
    icon: "lightbulb",
    duties:
      "Streetlight repair, replacement, new installations. Energy efficiency upgrades and outage response.",
    categories: ["streetlight"],
  },
  traffic_engineering: {
    id: "traffic_engineering",
    label: "Traffic Engineering & Signals Division",
    shortLabel: "Traffic Engineering",
    color: "#9c68e6",
    icon: "sign-post",
    duties:
      "Traffic signal installation/timing. Road pavement markings, signage, crosswalk safety, school zone systems.",
    categories: ["downed_sign", "faded_signage"],
  },
  parks_forestry: {
    id: "parks_forestry",
    label: "Parks & Recreation / Urban Forestry",
    shortLabel: "Parks & Forestry",
    color: "#2ba06e",
    icon: "tree-pine",
    duties:
      "Park facility maintenance. Right-of-way tree trimming, removal, planting. Irrigation, turf, landscaping.",
    categories: ["tree_down"],
  },
  graffiti_abatement: {
    id: "graffiti_abatement",
    label: "Graffiti Abatement / Community Beautification",
    shortLabel: "Graffiti Abatement",
    color: "#d052a8",
    icon: "spray-can",
    duties:
      "Graffiti removal from public infrastructure and city facilities. Coordinates with code enforcement and law enforcement.",
    categories: ["graffiti"],
  },
  code_enforcement: {
    id: "code_enforcement",
    label: "Code Enforcement Division",
    shortLabel: "Code Enforcement",
    color: "#2a9b9c",
    icon: "shield-alert",
    duties:
      "Property maintenance violations, illegal dumping, derelict buildings, inoperable vehicles, unpermitted construction.",
    categories: ["illegal_dump"],
  },
  environmental_services: {
    id: "environmental_services",
    label: "Environmental Services / Solid Waste",
    shortLabel: "Environmental Services",
    color: "#6a9a25",
    icon: "trash-2",
    duties:
      "Trash and recycling collection. Illegal dumping cleanup, bulky item pickup, household hazardous waste disposal, public debris.",
    categories: ["debris"],
  },
  general_admin: {
    id: "general_admin",
    label: "General Administration / 311 Triage",
    shortLabel: "General Admin",
    color: "#787783",
    icon: "help-circle",
    duties:
      "Initial triage for uncategorized reports. Routes to appropriate department after manual review.",
    categories: ["other"],
  },
};

// Reverse lookup built at module load: category → owning team.
const CATEGORY_TO_TEAM: Record<ReportCategory, TeamId> = (() => {
  const map = {} as Record<ReportCategory, TeamId>;
  for (const team of Object.values(TEAMS)) {
    for (const cat of team.categories) {
      map[cat] = team.id;
    }
  }
  return map;
})();

// Raw category → team mapping, ignoring runtime overrides. Used by the
// routing-matrix UI to detect "is this row currently overridden?" and by
// any future audit log that needs the un-overridden baseline.
export function categoryToTeamDefault(category: ReportCategory): TeamId {
  return CATEGORY_TO_TEAM[category] ?? "general_admin";
}

// Override-aware resolver. Reads the per-category override snapshot first
// (mutated by the routing-matrix dropdown), falling back to the static
// baseline. Stays synchronous so non-React callers (filter-reports,
// aggregateByTeam, server-rendered code) can keep their existing shape.
export function categoryToTeam(category: ReportCategory): TeamId {
  // The snapshot lives in a `"use client"` module, and React THROWS on any
  // attempt to invoke one of those from the server — "Attempted to call
  // getCategoryOverridesSnapshot() from the server". That is not a degraded
  // render, it kills the whole component tree.
  //
  // Which is exactly what happened to /r/[token], a server component that
  // resolves a report's owning team for the public status page: the render
  // threw mid-stream, so the response had already gone out as 200 with correct
  // metadata and the visitor got "A server error occurred". It stayed hidden
  // because no seeded report had a public_token, so every one of those URLs
  // 404'd before it could reach the render.
  //
  // The overrides are a per-browser staff preference — the routing-matrix
  // dropdown writes them into a client store — so they do not exist on the
  // server in any meaningful sense, and the baseline IS the server's correct
  // answer rather than a fallback. Guarding here fixes every server caller at
  // once (dashboard-queries, delegation-history, the onboarding modules) rather
  // than at each call site.
  const override =
    typeof window === "undefined"
      ? undefined
      : getCategoryOverridesSnapshot()[category];
  if (override) return override;
  return CATEGORY_TO_TEAM[category] ?? "general_admin";
}

export const TEAM_LIST: TeamMeta[] = Object.values(TEAMS);

export function isValidTeamId(value: string): value is TeamId {
  return value in TEAMS;
}

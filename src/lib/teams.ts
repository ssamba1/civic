import { getCategoryOverridesSnapshot } from "@/lib/category-overrides";
import type { ReportCategory } from "@/lib/types";

/* ------------------------------------------------------------------
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
    color: "#9a9aa0",
    icon: "users",
    duties: "Citywide oversight across every department.",
    categories: [],
  },
  streets_roads: {
    id: "streets_roads",
    label: "Streets & Roads Division",
    shortLabel: "Streets & Roads",
    color: "#b0574c",
    icon: "construction",
    duties:
      "Pothole repair, milling, repaving, full street reconstruction. Curb/gutter, lane markings, asphalt and concrete maintenance.",
    categories: ["pothole"],
  },
  sidewalks_ada: {
    id: "sidewalks_ada",
    label: "Sidewalk & ADA Compliance Division",
    shortLabel: "Sidewalks & ADA",
    color: "#c07a3c",
    icon: "footprints",
    duties:
      "Sidewalk repair and replacement. Curb ramp installation and upgrades. ADA accessibility audits and trip hazard remediation.",
    categories: ["sidewalk_damage"],
  },
  stormwater: {
    id: "stormwater",
    label: "Stormwater / Drainage Division",
    shortLabel: "Stormwater",
    color: "#5b6b8c",
    icon: "waves",
    duties:
      "Catch basin cleaning, storm pipe maintenance, flood mitigation. 24/7 emergency response to localized flooding and stormwater pollution.",
    categories: ["drainage"],
  },
  water_utilities: {
    id: "water_utilities",
    label: "Water & Utilities Division",
    shortLabel: "Water & Utilities",
    color: "#5f8ba6",
    icon: "droplets",
    duties:
      "Water main breaks, leak detection, fire hydrant maintenance. Potable and reclaimed water distribution systems.",
    categories: ["water_leak"],
  },
  street_lighting: {
    id: "street_lighting",
    label: "Street Lighting Division",
    shortLabel: "Street Lighting",
    color: "#ad8434",
    icon: "lightbulb",
    duties:
      "Streetlight repair, replacement, new installations. Energy efficiency upgrades and outage response.",
    categories: ["streetlight"],
  },
  traffic_engineering: {
    id: "traffic_engineering",
    label: "Traffic Engineering & Signals Division",
    shortLabel: "Traffic Engineering",
    color: "#7c6f9c",
    icon: "sign-post",
    duties:
      "Traffic signal installation/timing. Road pavement markings, signage, crosswalk safety, school zone systems.",
    categories: ["downed_sign", "faded_signage"],
  },
  parks_forestry: {
    id: "parks_forestry",
    label: "Parks & Recreation / Urban Forestry",
    shortLabel: "Parks & Forestry",
    color: "#4d8a6a",
    icon: "tree-pine",
    duties:
      "Park facility maintenance. Right-of-way tree trimming, removal, planting. Irrigation, turf, landscaping.",
    categories: ["tree_down"],
  },
  graffiti_abatement: {
    id: "graffiti_abatement",
    label: "Graffiti Abatement / Community Beautification",
    shortLabel: "Graffiti Abatement",
    color: "#a3647e",
    icon: "spray-can",
    duties:
      "Graffiti removal from public infrastructure and city facilities. Coordinates with code enforcement and law enforcement.",
    categories: ["graffiti"],
  },
  code_enforcement: {
    id: "code_enforcement",
    label: "Code Enforcement Division",
    shortLabel: "Code Enforcement",
    color: "#b6b6bc",
    icon: "shield-alert",
    duties:
      "Property maintenance violations, illegal dumping, derelict buildings, inoperable vehicles, unpermitted construction.",
    categories: ["illegal_dump"],
  },
  environmental_services: {
    id: "environmental_services",
    label: "Environmental Services / Solid Waste",
    shortLabel: "Environmental Services",
    color: "#7f8a45",
    icon: "trash-2",
    duties:
      "Trash and recycling collection. Illegal dumping cleanup, bulky item pickup, household hazardous waste disposal, public debris.",
    categories: ["debris"],
  },
  general_admin: {
    id: "general_admin",
    label: "General Administration / 311 Triage",
    shortLabel: "General Admin",
    color: "#6f6f75",
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
  const override = getCategoryOverridesSnapshot()[category];
  if (override) return override;
  return CATEGORY_TO_TEAM[category] ?? "general_admin";
}

export const TEAM_LIST: TeamMeta[] = Object.values(TEAMS);

export function isValidTeamId(value: string): value is TeamId {
  return value in TEAMS;
}

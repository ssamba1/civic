import type { ReportCategory, ReportStatus } from "@/lib/types";

/* ------------------------------------------------------------------
   Dashboard-specific types (flattened from Report + Classification)
   ------------------------------------------------------------------ */

export interface DashboardReport {
  id: string;
  category: ReportCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  status: ReportStatus;
  address: string;
  location: { lng: number; lat: number };
  photo_public_url: string;
  created_at: string;
  upvote_count: number;
  tags: string[];
}

export interface CityStats {
  total: number;
  open: number;
  resolved: number;
  avg_resolution_hours: number;
  this_week: number;
  prev_week: number;
}

export interface CategoryCount {
  category: ReportCategory;
  count: number;
}

/* ------------------------------------------------------------------
   Known cities — used for generateStaticParams + fallback coords
   ------------------------------------------------------------------ */

export const KNOWN_CITIES: Record<
  string,
  { name: string; state: string; center: [number, number]; zoom: number }
> = {
  cumming: {
    name: "Cumming",
    state: "GA",
    center: [-84.1402, 34.2073],
    zoom: 12,
  },
};

/* ------------------------------------------------------------------
   Category metadata — labels, colors, icons
   ------------------------------------------------------------------ */

export const CATEGORY_META: Record<
  ReportCategory,
  { label: string; color: string; icon: string }
> = {
  pothole: { label: "Pothole", color: "#ef4444", icon: "circle-alert" },
  streetlight: { label: "Streetlight", color: "#f59e0b", icon: "lightbulb" },
  downed_sign: { label: "Downed Sign", color: "#8b5cf6", icon: "sign-post" },
  graffiti: { label: "Graffiti", color: "#ec4899", icon: "spray-can" },
  illegal_dump: { label: "Illegal Dump", color: "#84cc16", icon: "trash-2" },
  water_leak: { label: "Water Leak", color: "#06b6d4", icon: "droplets" },
  sidewalk_damage: { label: "Sidewalk", color: "#f97316", icon: "footprints" },
  tree_down: { label: "Tree Down", color: "#22c55e", icon: "tree-pine" },
  debris: { label: "Debris", color: "#a3a3a3", icon: "construction" },
  drainage: { label: "Drainage", color: "#3b82f6", icon: "waves" },
  faded_signage: { label: "Faded Signage", color: "#d4d4d4", icon: "sign-post" },
  other: { label: "Other", color: "#737373", icon: "help-circle" },
};

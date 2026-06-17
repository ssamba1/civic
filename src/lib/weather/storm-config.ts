/**
 * Central storm-advisory configuration: pure constants, no side effects.
 * Mirrors the pattern in src/lib/ai/config.ts.
 */
import type { ReportCategory } from "@/lib/types";

/**
 * Single-city deployment center point, used to query NWS alerts. Matches the
 * Cumming, GA fallback used elsewhere (src/app/report/actions.ts). When this
 * app supports multiple cities, this should come from each city's stored
 * coordinates instead of a constant.
 */
export const CITY_CENTER = { lat: 34.2073, lng: -84.1402 } as const;

/** api.weather.gov requires an identifying User-Agent; no API key needed. */
export const NWS_USER_AGENT =
  "CivicInfrastructureReporting/1.0 (civic infrastructure reporting app)";

/** Per-request abort timeout for the NWS call, in milliseconds. */
export const NWS_TIMEOUT_MS = 5000;

/**
 * How far back to look for alerts that were in effect, so the advisory keeps
 * showing for a while after a storm passes (not just while a warning is
 * literally still active) — covers "open it after a massive storm."
 */
export const LOOKBACK_HOURS = 12;

/** How far ahead the predicted-surge counts project, in hours. */
export const FORECAST_WINDOW_HOURS = 48;

/** How many days of history to average for each category's daily baseline. */
export const BASELINE_LOOKBACK_DAYS = 30;

export interface StormProfile {
  /** Relative multiplier applied to a category's historical daily average. */
  multiplier: number;
  /** Report categories plausibly driven up by this event type. */
  categories: ReportCategory[];
  /** Higher tier = more severe; used to pick the single headline alert. */
  tier: number;
}

/**
 * Deterministic event-type -> impact-profile table. There is no
 * storm-correlated historical training set in this system, so this is a
 * heuristic (event severity x affected categories x baseline rate), not a
 * trained model — surfaced as such in the API response.
 */
export const STORM_PROFILES: ReadonlyArray<{ matches: RegExp; profile: StormProfile }> = [
  {
    matches: /tornado warning/i,
    profile: {
      multiplier: 6,
      categories: ["tree_down", "downed_sign", "streetlight", "debris", "sidewalk_damage"],
      tier: 100,
    },
  },
  {
    matches: /hurricane warning|tropical storm warning/i,
    profile: {
      multiplier: 5,
      categories: ["tree_down", "downed_sign", "streetlight", "debris", "water_leak", "drainage"],
      tier: 95,
    },
  },
  {
    matches: /flash flood warning/i,
    profile: {
      multiplier: 4,
      categories: ["drainage", "water_leak", "sidewalk_damage", "pothole"],
      tier: 90,
    },
  },
  {
    matches: /severe thunderstorm warning/i,
    profile: {
      multiplier: 3,
      categories: ["tree_down", "streetlight", "debris", "downed_sign"],
      tier: 80,
    },
  },
  {
    matches: /ice storm warning|winter storm warning/i,
    profile: {
      multiplier: 2.5,
      categories: ["downed_sign", "streetlight", "pothole", "tree_down"],
      tier: 70,
    },
  },
  {
    matches: /(?<!flash )flood warning/i,
    profile: {
      multiplier: 2.5,
      categories: ["drainage", "water_leak", "sidewalk_damage"],
      tier: 65,
    },
  },
  {
    matches: /high wind warning/i,
    profile: {
      multiplier: 2,
      categories: ["tree_down", "downed_sign", "streetlight"],
      tier: 60,
    },
  },
  {
    matches: /tornado watch|severe thunderstorm watch/i,
    profile: {
      multiplier: 1.5,
      categories: ["tree_down", "streetlight", "debris"],
      tier: 40,
    },
  },
  {
    matches: /wind advisory|winter weather advisory|flood watch/i,
    profile: {
      multiplier: 1.3,
      categories: ["tree_down", "downed_sign", "drainage"],
      tier: 20,
    },
  },
];

export function profileForEvent(event: string): StormProfile | null {
  for (const { matches, profile } of STORM_PROFILES) {
    if (matches.test(event)) return profile;
  }
  return null;
}

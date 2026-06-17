import type { ReportCategory } from "@/lib/types";
import { getCategoryDailyBaseline } from "./baseline";
import { fetchRecentAlerts, type NwsAlert } from "./nws-client";
import { FORECAST_WINDOW_HOURS, profileForEvent } from "./storm-config";

export interface StormAdvisoryCategoryImpact {
  category: ReportCategory;
  baselineDailyAvg: number;
  multiplier: number;
  predictedCount: number | null;
}

export interface StormAdvisory {
  hasActiveOrRecentStorm: boolean;
  alerts: NwsAlert[];
  headlineAlert: NwsAlert | null;
  forecastWindowHours: number;
  overallMultiplier: number;
  categoryBreakdown: StormAdvisoryCategoryImpact[];
  methodologyNote: string;
  generatedAt: string;
}

const METHODOLOGY_NOTE =
  "Heuristic estimate, not a trained model: combines active/recent NWS alerts " +
  "for this area with this city's own historical average daily report volume " +
  "per category, scaled by a fixed severity multiplier for the alert type. " +
  "Treat as directional guidance for staffing/triage, not a guarantee.";

export async function buildStormAdvisory(): Promise<StormAdvisory> {
  const [alerts, baseline] = await Promise.all([
    fetchRecentAlerts(),
    getCategoryDailyBaseline(),
  ]);

  const generatedAt = new Date().toISOString();

  if (alerts.length === 0) {
    return {
      hasActiveOrRecentStorm: false,
      alerts: [],
      headlineAlert: null,
      forecastWindowHours: FORECAST_WINDOW_HOURS,
      overallMultiplier: 1,
      categoryBreakdown: [],
      methodologyNote: METHODOLOGY_NOTE,
      generatedAt,
    };
  }

  // Best multiplier per category across all active/recent alerts (conservative: take the max).
  const categoryMultipliers = new Map<ReportCategory, number>();
  let headlineAlert: NwsAlert | null = null;
  let headlineTier = -1;

  for (const alert of alerts) {
    const profile = profileForEvent(alert.event);
    if (!profile) continue;

    if (profile.tier > headlineTier) {
      headlineTier = profile.tier;
      headlineAlert = alert;
    }

    for (const cat of profile.categories) {
      const current = categoryMultipliers.get(cat) ?? 1;
      categoryMultipliers.set(cat, Math.max(current, profile.multiplier));
    }
  }

  const forecastDays = FORECAST_WINDOW_HOURS / 24;
  const categoryBreakdown: StormAdvisoryCategoryImpact[] = Array.from(
    categoryMultipliers.entries(),
  )
    .map(([category, multiplier]) => {
      const baselineDailyAvg = baseline[category] ?? 0;
      const predictedCount =
        baselineDailyAvg > 0 ? Math.round(baselineDailyAvg * multiplier * forecastDays) : null;
      return { category, baselineDailyAvg, multiplier, predictedCount };
    })
    .sort((a, b) => (b.predictedCount ?? 0) - (a.predictedCount ?? 0));

  const overallMultiplier =
    categoryBreakdown.length > 0
      ? Math.max(...categoryBreakdown.map((c) => c.multiplier))
      : 1;

  return {
    hasActiveOrRecentStorm: categoryBreakdown.length > 0,
    alerts,
    headlineAlert,
    forecastWindowHours: FORECAST_WINDOW_HOURS,
    overallMultiplier,
    categoryBreakdown,
    methodologyNote: METHODOLOGY_NOTE,
    generatedAt,
  };
}

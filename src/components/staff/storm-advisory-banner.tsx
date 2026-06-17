"use client";

import { AlertTriangle, CloudLightning } from "lucide-react";
import { useEffect, useState } from "react";

interface StormAdvisoryAlert {
  id: string;
  event: string;
  severity: string;
  headline: string | null;
  areaDesc: string;
  expires: string;
  status: "active" | "expired";
}

interface StormAdvisoryCategoryImpact {
  category: string;
  baselineDailyAvg: number;
  multiplier: number;
  predictedCount: number | null;
}

interface StormAdvisory {
  hasActiveOrRecentStorm: boolean;
  alerts: StormAdvisoryAlert[];
  headlineAlert: StormAdvisoryAlert | null;
  forecastWindowHours: number;
  overallMultiplier: number;
  categoryBreakdown: StormAdvisoryCategoryImpact[];
  methodologyNote: string;
  generatedAt: string;
}

const POLL_MS = 5 * 60_000;

export function StormAdvisoryBanner() {
  const [advisory, setAdvisory] = useState<StormAdvisory | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/staff/storm-advisory");
        if (!res.ok) return;
        const data = (await res.json()) as StormAdvisory;
        if (!cancelled) setAdvisory(data);
      } catch {
        // Fail soft — never break the staff console over a weather lookup.
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!advisory || !advisory.hasActiveOrRecentStorm) return null;

  const headline = advisory.headlineAlert;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-2 text-left"
      >
        <CloudLightning className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {headline ? headline.event : "Severe weather in the area"} — expect more reports
            than usual over the next {advisory.forecastWindowHours}h
          </p>
          {headline?.headline && (
            <p className="mt-0.5 text-xs opacity-90">{headline.headline}</p>
          )}
          <p className="mt-1 text-xs underline opacity-75">
            {expanded ? "Hide breakdown" : "Show predicted impact breakdown"}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pl-7">
          {advisory.alerts.length > 0 && (
            <div className="space-y-1">
              {advisory.alerts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  <span className="font-medium">{a.event}</span>
                  <span className="opacity-75">
                    ({a.status === "active" ? "active" : "recently expired"}, {a.areaDesc})
                  </span>
                </div>
              ))}
            </div>
          )}

          {advisory.categoryBreakdown.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left opacity-75">
                  <th className="pb-1 pr-4">Category</th>
                  <th className="pb-1 pr-4">Normal/day</th>
                  <th className="pb-1 pr-4">Multiplier</th>
                  <th className="pb-1">Predicted ({advisory.forecastWindowHours}h)</th>
                </tr>
              </thead>
              <tbody>
                {advisory.categoryBreakdown.map((c) => (
                  <tr key={c.category}>
                    <td className="pr-4 py-0.5 capitalize">{c.category.replace(/_/g, " ")}</td>
                    <td className="pr-4 py-0.5">{c.baselineDailyAvg.toFixed(1)}</td>
                    <td className="pr-4 py-0.5">{c.multiplier}x</td>
                    <td className="py-0.5 font-medium">
                      {c.predictedCount ?? "limited historical data"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-[11px] italic opacity-70">{advisory.methodologyNote}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { AlertTriangle, Loader2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Storm/emergency surge banner (NEXT_100 #63).

   The storm engine (lib/weather/storm-advisory.ts) already existed but nothing
   surfaced it. This banner reads GET /api/admin/surge, shows the headline alert
   + the categories predicted to spike, and lets staff one-click auto-reprioritize
   the affected backlog (POST). No competitor has a purpose-built surge mode.
   Renders nothing when there's no active/recent storm.
   ================================================================== */

interface CategoryImpact {
  category: ReportCategory;
  multiplier: number;
  predictedCount: number | null;
}

interface Advisory {
  hasActiveOrRecentStorm: boolean;
  headlineAlert: { event?: string; headline?: string } | null;
  overallMultiplier: number;
  categoryBreakdown: CategoryImpact[];
  methodologyNote: string;
}

export function SurgeBanner() {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/surge")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Advisory | null) => {
        if (active && data?.hasActiveOrRecentStorm) setAdvisory(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!advisory) return null;

  const top = advisory.categoryBreakdown.slice(0, 4);

  async function applySurge() {
    setApplying(true);
    try {
      const res = await fetch("/api/admin/surge", { method: "POST" });
      const data = (await res.json()) as { reprioritized?: number };
      setApplied(data.reprioritized ?? 0);
    } catch {
      setApplied(0);
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/[0.08] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--status-warning-fg)]"
            strokeWidth={2}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-foreground">
              Storm surge expected
              {advisory.headlineAlert?.event
                ? ` · ${advisory.headlineAlert.event}`
                : ""}
            </h2>
            <p className="mt-1 text-[13px] text-subtle">
              Report volume is projected to rise up to{" "}
              {advisory.overallMultiplier.toFixed(1)}× in affected categories.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {top.map((c) => {
                const meta = CATEGORY_META[c.category] ?? CATEGORY_META.other;
                return (
                  <span
                    key={c.category}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-2 py-0.5 text-[12px] text-foreground"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden="true"
                    />
                    {meta.label}
                    {c.predictedCount != null ? ` ~${c.predictedCount}` : ""}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {applied == null ? (
            <button
              type="button"
              onClick={applySurge}
              disabled={applying}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-[13px] font-medium text-[var(--accent-contrast)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Reprioritize backlog
            </button>
          ) : (
            <span className="text-[13px] font-medium text-[var(--status-success-fg)]">
              {applied} work order{applied === 1 ? "" : "s"} reprioritized
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

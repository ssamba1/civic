"use client";

import { Clock, ListChecks, TriangleAlert } from "lucide-react";
import { memo } from "react";
import type { ResolutionBucket } from "@/lib/analytics-data";
import { categoryMeta } from "@/lib/dashboard-data";
import type { AttentionItem } from "@/lib/filters/derive";
import {
  STATUS_LABEL,
  type StatusTone,
  statusChipClass,
  toneTextClass,
} from "@/lib/status";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

/* ==================================================================
   Ops rail — actionable analytics that sit under the live report feed
   in the analytics right column. Non-sticky: they scroll with the page
   so the column can hold a stack instead of one pinned panel.

   Both are read-only summaries derived from the already-filtered set;
   NeedsAttention rows click through to focus a report (same wire as the
   live feed).
   ================================================================== */

const PANEL = "rounded-xl bg-surface border border-hairline";

/* ------------------------------------------------------------------
   1. Needs-attention triage queue
   ------------------------------------------------------------------ */

// Severity → tone. Mirrors the donut/report-detail thresholds: 4-5 pages
// on-call (danger), 3 is same-week (warning), 1-2 batches (neutral).
function severityTone(severity: number): StatusTone {
  return severity >= 4 ? "danger" : severity === 3 ? "warning" : "neutral";
}

interface NeedsAttentionProps {
  items: AttentionItem[];
  focusedId?: string | null;
  onClickReport?: (id: string) => void;
}

function NeedsAttentionInner({
  items,
  focusedId = null,
  onClickReport,
}: NeedsAttentionProps) {
  return (
    <section className={cn(PANEL, "p-3 sm:p-4")}>
      <div className="flex items-center justify-between pb-3 border-b border-hairline">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <ListChecks className="h-4 w-4 text-faint" strokeWidth={1.75} />
          Needs attention
        </h2>
        <span className="text-[13px] text-faint tabular-nums">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-subtle">
          Backlog clear — nothing open in range.
        </p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {items.map((item) => {
            const meta = categoryMeta(item.category);
            const isFocused = focusedId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onClickReport?.(item.id)}
                  aria-current={isFocused ? "true" : undefined}
                  className={cn(
                    "w-full text-left flex flex-col gap-1 py-2.5 px-2 min-h-11 rounded-md transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    isFocused ? "bg-overlay-strong" : "hover:bg-overlay",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground leading-tight">
                      <span
                        className={cn(
                          "flex-shrink-0 rounded px-1 py-px text-[11px] font-semibold tabular-nums border border-hairline bg-overlay",
                          toneTextClass(severityTone(item.severity)),
                        )}
                      >
                        S{item.severity}
                      </span>
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden
                      />
                      <span className="truncate">{meta.label}</span>
                    </span>
                    <span
                      className={cn(
                        "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                        statusChipClass(item.status),
                      )}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12px] text-faint leading-tight">
                    <span className="truncate">{item.address}</span>
                    <span className="inline-flex flex-shrink-0 items-center gap-2">
                      {item.breaches_sla && (
                        <span className="inline-flex items-center gap-0.5 font-medium text-[var(--status-danger-fg)]">
                          <TriangleAlert className="h-3 w-3" strokeWidth={2} />
                          SLA
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" strokeWidth={1.75} />
                        {timeAgo(item.created_at)}
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export const NeedsAttention = memo(NeedsAttentionInner);

/* ------------------------------------------------------------------
   2. Backlog age distribution
   ------------------------------------------------------------------ */

// Age ramp: fresh buckets stay quiet (subtle ink); the older two carry
// warning/danger hue so a growing stale tail draws the eye. Index-aligned to
// the BUCKETS order in derive.ts (<24h, 1-3d, 3-7d, 1-2w, >2w).
const AGE_BAR_TONES = [
  "var(--subtle)",
  "var(--subtle)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-danger)",
];

interface BacklogAgeProps {
  buckets: ResolutionBucket[];
}

function BacklogAgeInner({ buckets }: BacklogAgeProps) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <section className={cn(PANEL, "p-3 sm:p-4")}>
      <div className="flex items-center justify-between pb-3 border-b border-hairline">
        <h2 className="text-[15px] font-semibold text-foreground">
          Backlog age
        </h2>
        <span className="text-[13px] text-faint tabular-nums">
          {total} open
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-[13px] text-subtle">
          No open backlog in range.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {buckets.map((b, i) => (
            <li key={b.label} className="flex items-center gap-3 text-[12px]">
              <span className="w-10 flex-shrink-0 text-faint tabular-nums">
                {b.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${(b.count / max) * 100}%`,
                    background: AGE_BAR_TONES[i] ?? "var(--subtle)",
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="w-6 flex-shrink-0 text-right tabular-nums text-subtle">
                {b.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const BacklogAge = memo(BacklogAgeInner);

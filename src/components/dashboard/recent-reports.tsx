"use client";

import { Clock, Maximize2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

interface RecentReportsProps {
  reports: DashboardReport[];
  focusedId?: string | null;
  onClickReport?: (id: string) => void;
  /** Tailwind max-height class for the panel. Defaults to a 480px cap. */
  maxHeightClass?: string;
  /** Optional expand handler. When provided, an expand button renders in the
     header so the full reports list can open in an overlay. */
  onExpand?: () => void;
  /** Optional hover binding per row (analytics reasoning hover card). When
     omitted (e.g. on the dashboard) rows have no hover behavior. */
  bindReportHover?: (report: { id: string; label: string }) => {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: () => void;
  };
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

// Pill tone: text color paired with a low-alpha wash of the same hue so the
// status reads as a chip, not loose colored text on the card.
const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-subtle bg-overlay-strong",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

function RecentReportsInner({
  reports,
  focusedId = null,
  onClickReport,
  maxHeightClass = "max-h-[60vh] sm:max-h-[480px]",
  onExpand,
  bindReportHover,
}: RecentReportsProps) {
  const listContainerRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!focusedId) return;
    const targetEl = itemsRef.current[focusedId];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedId]);

  const panelClass = "rounded-xl bg-surface border border-hairline";

  if (reports.length === 0) {
    return (
      <section className={`${panelClass} p-5 rr-empty`}>
        <style>{`
@keyframes rr-empty-in{from{opacity:0}to{opacity:1}}
.rr-empty{animation:rr-empty-in 300ms ease 150ms both}
@media (prefers-reduced-motion:reduce){.rr-empty{animation:none}}
`}</style>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Reports</h2>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-faint">0</span>
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                aria-label="Expand reports"
                className="flex-shrink-0 inline-flex items-center justify-center h-11 w-11 -mr-2 text-faint hover:text-foreground rounded-md transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-subtle">No matching reports.</p>
      </section>
    );
  }

  return (
    <section
      className={cn(
        panelClass,
        "p-3 sm:p-4 flex flex-col h-full overflow-hidden",
        maxHeightClass,
      )}
    >
      <div className="flex items-center justify-between pb-3 border-b border-hairline">
        <h2 className="text-[15px] font-semibold text-foreground">Reports</h2>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-faint tabular-nums">
            {reports.length}
          </span>
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand reports"
              className="flex-shrink-0 inline-flex items-center justify-center h-11 w-11 -mr-2 text-faint hover:text-foreground rounded-md transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <style>{`
@keyframes rr-row-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.rr-row{animation:rr-row-in 220ms cubic-bezier(0.22,1,0.36,1) both}
@media (prefers-reduced-motion:reduce){.rr-row{animation:none}}
`}</style>
      <ul
        ref={listContainerRef}
        className="overflow-y-auto custom-scrollbar -mx-1 px-1 flex-1 scroll-smooth flex flex-col mt-2"
      >
        {reports.map((report, index) => {
          const meta = CATEGORY_META[report.category];
          const isFocused = focusedId === report.id;
          const isDemo = report.demo === true;

          return (
            <li
              key={report.id}
              ref={(el) => {
                itemsRef.current[report.id] = el;
              }}
              className="rr-row"
              // Cap the stagger so a long list never delays the tail by seconds;
              // only the first ~10 rows above the fold get the cascade.
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onClickReport?.(report.id);
                }}
                {...(bindReportHover?.({ id: report.id, label: meta.label }) ??
                  {})}
                aria-current={isFocused ? "true" : undefined}
                className={cn(
                  "w-full text-left flex flex-col gap-1 py-3 sm:py-2.5 px-2 min-h-11 rounded-md transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e]",
                  isFocused ? "bg-overlay-strong" : "hover:bg-overlay",
                  isDemo && "demo-glow",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground leading-tight">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden
                    />
                    <span className="truncate">{meta.label}</span>
                  </p>
                  <span
                    className={cn(
                      "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      STATUS_TONE[report.status],
                    )}
                  >
                    {STATUS_LABEL[report.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px] text-faint leading-tight">
                  <span className="truncate">{report.address}</span>
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" strokeWidth={1.75} />
                    {timeAgo(report.created_at)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const RecentReports = memo(RecentReportsInner);

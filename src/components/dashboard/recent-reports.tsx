"use client";

import { memo, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";
import type { ReportStatus } from "@/lib/types";
import { UpvoteButton } from "@/components/dashboard/upvote-button";

interface RecentReportsProps {
  reports: DashboardReport[];
  focusedId?: string | null;
  onClickReport?: (id: string) => void;
  upvotedIds?: string[];
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
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

function RecentReportsInner({
  reports,
  focusedId = null,
  onClickReport,
  upvotedIds = [],
}: RecentReportsProps) {
  const upvotedSet = new Set(upvotedIds);
  const listContainerRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!focusedId) return;
    const targetEl = itemsRef.current[focusedId];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedId]);

  const panelClass = "rounded-xl bg-[#1c1c1e] border border-white/[0.06]";

  if (reports.length === 0) {
    return (
      <section className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-white">Reports</h2>
          <span className="text-[13px] text-zinc-500">0</span>
        </div>
        <p className="mt-3 text-sm text-zinc-400">No matching reports.</p>
      </section>
    );
  }

  return (
    <section
      className={`${panelClass} p-4 flex flex-col h-full max-h-[480px] overflow-hidden`}
    >
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <h2 className="text-[15px] font-semibold text-white">Reports</h2>
        <span className="text-[13px] text-zinc-500 tabular-nums">
          {reports.length}
        </span>
      </div>

      <ul
        ref={listContainerRef}
        className="overflow-y-auto custom-scrollbar -mx-1 px-1 flex-1 scroll-smooth flex flex-col mt-2"
        role="list"
      >
        {reports.map((report) => {
          const meta = CATEGORY_META[report.category];
          const isFocused = focusedId === report.id;

          return (
            <li
              key={report.id}
              ref={(el) => {
                itemsRef.current[report.id] = el;
              }}
            >
             <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onClickReport?.(report.id);
                }}
                aria-current={isFocused ? "true" : undefined}
                className={cn(
                  "flex-1 min-w-0 text-left flex flex-col gap-1 py-2.5 px-2 rounded-md transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e]",
                  isFocused ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-white leading-tight">
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
                <div className="flex items-center justify-between gap-3 text-[12px] text-zinc-500 leading-tight">
                  <span className="truncate">{report.address}</span>
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" strokeWidth={1.75} />
                    {timeAgo(report.created_at)}
                  </span>
                </div>
              </button>
              <UpvoteButton
                reportId={report.id}
                count={report.upvote_count ?? 0}
                upvoted={upvotedSet.has(report.id)}
              />
             </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const RecentReports = memo(RecentReportsInner);

function timeAgo(iso: string): string {
  // Clamp to 0 so clock skew (a created_at slightly in the future) never
  // renders a negative or nonsensical "-1m".
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

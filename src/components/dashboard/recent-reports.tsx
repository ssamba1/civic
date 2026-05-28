"use client";

import { memo, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";
import type { ReportStatus } from "@/lib/types";

interface RecentReportsProps {
  reports: DashboardReport[];
  focusedId?: string | null;
  onClickReport?: (id: string) => void;
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a]",
  dispatched: "text-[#0a84ff]",
  in_progress: "text-[#5ac8fa]",
  closed: "text-[#30d158]",
  merged: "text-zinc-500",
  rejected: "text-[#ff453a]",
};

function RecentReportsInner({
  reports,
  focusedId = null,
  onClickReport,
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
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onClickReport?.(report.id);
                }}
                className={cn(
                  "w-full text-left flex flex-col gap-1 py-2.5 px-2 rounded-md transition-colors outline-none",
                  isFocused
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.03]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-white leading-tight">
                    {meta.label}
                  </p>
                  <span
                    className={cn(
                      "text-[12px] flex-shrink-0",
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const RecentReports = memo(RecentReportsInner);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

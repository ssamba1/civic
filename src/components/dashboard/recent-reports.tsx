"use client";

import { useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Truck,
  Wrench,
} from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";
import type { ReportStatus } from "@/lib/types";
import { UpvoteButton } from "@/components/dashboard/upvote-button";

interface RecentReportsProps {
  reports: DashboardReport[];
  focusedId?: string | null;
  onHoverReport?: (id: string | null) => void;
  onClickReport?: (id: string) => void;
  upvotedIds?: string[];
}

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  open: {
    label: "Open",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  dispatched: {
    label: "Dispatched",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Truck className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <Wrench className="h-3 w-3" />,
  },
  closed: {
    label: "Resolved",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  merged: {
    label: "Merged",
    className: "bg-zinc-50 text-zinc-600 border-zinc-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-600 border-red-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function RecentReports({
  reports,
  focusedId = null,
  onHoverReport,
  onClickReport,
  upvotedIds = [],
}: RecentReportsProps) {
  const upvotedSet = new Set(upvotedIds);
  const listContainerRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<Record<string, HTMLLIElement | null>>({});

  // Auto-scroll the active item into view when focused from map
  useEffect(() => {
    if (!focusedId) return;

    const targetEl = itemsRef.current[focusedId];
    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [focusedId]);

  if (reports.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Recent Reports</h2>
        <p className="mt-4 text-sm text-zinc-500">
          No matching reports found with the current filters.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col h-full max-h-[550px] overflow-hidden">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Recent Reports</h2>
        <p className="text-xs text-zinc-400 mt-1 mb-3">
          Showing {reports.length} matching incidents &middot; Hover/click to interact
        </p>
      </div>

      <ul
        ref={listContainerRef}
        className="divide-y divide-zinc-100 overflow-y-auto pr-1 flex-1 scroll-smooth"
        role="list"
      >
        {reports.map((report) => {
          const meta = CATEGORY_META[report.category];
          const statusCfg = STATUS_CONFIG[report.status];
          const isFocused = focusedId === report.id;

          return (
            <li
              key={report.id}
              ref={(el) => {
                itemsRef.current[report.id] = el;
              }}
              onMouseEnter={() => onHoverReport && onHoverReport(report.id)}
              onMouseLeave={() => onHoverReport && onHoverReport(null)}
              className="py-1"
            >
             <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (onClickReport) onClickReport(report.id);
                }}
                className={cn(
                  "flex-1 min-w-0 text-left flex items-center gap-4 py-3 px-3 rounded-lg border border-transparent transition-all duration-200 outline-none select-none",
                  isFocused
                    ? "bg-zinc-50 border-zinc-200/60 shadow-sm"
                    : "hover:bg-zinc-50/50"
                )}
                style={
                  isFocused
                    ? { borderLeft: `4px solid ${meta.color}`, paddingLeft: "8px" }
                    : undefined
                }
              >
                {/* severity dot + category color */}
                <span className="relative flex-shrink-0">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold shadow-inner"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  >
                    {meta.label.charAt(0)}
                  </span>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white shadow",
                      severityColor(report.severity),
                    )}
                    title={`Severity ${report.severity}/5`}
                  />
                </span>

                {/* details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900 group-hover:text-blue-600">
                      {meta.label}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none flex-shrink-0",
                        statusCfg.className,
                      )}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1 truncate text-zinc-400">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {report.address}
                    </span>
                    <span className="inline-flex items-center gap-1 flex-shrink-0 text-zinc-400 font-mono">
                      <Clock className="h-3 w-3" />
                      {timeAgo(report.created_at)}
                    </span>
                  </div>
                </div>
              </button>
              <UpvoteButton
                reportId={report.id}
                count={report.upvote_count}
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

function severityColor(s: number): string {
  if (s >= 5) return "bg-red-500";
  if (s >= 4) return "bg-orange-500";
  if (s >= 3) return "bg-amber-400";
  if (s >= 2) return "bg-yellow-300";
  return "bg-green-400";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

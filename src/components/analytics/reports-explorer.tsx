"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { ReportDetail } from "@/components/analytics/report-detail";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils/cn";
import type { ReportStatus } from "@/lib/types";

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

export function ReportsExplorer({
  open,
  onClose,
  reports,
}: {
  open: boolean;
  onClose: () => void;
  reports: DashboardReport[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile: track whether the detail drawer is open (separate from list overlay)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Escape-to-close + body scroll lock while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Default the selection to the first report whenever the overlay opens or the
  // list changes and the current selection is no longer valid.
  useEffect(() => {
    if (!open) return;
    const stillValid = reports.some((r) => r.id === selectedId);
    if (!stillValid) {
      setSelectedId(reports[0]?.id ?? null);
    }
  }, [open, reports, selectedId]);

  // Close detail drawer when explorer closes
  useEffect(() => {
    if (!open) setDetailDrawerOpen(false);
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;

  const handleSelectReport = (id: string) => {
    setSelectedId(id);
    // On mobile (narrow viewport), open the drawer
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setDetailDrawerOpen(true);
    }
  };

  const reportListContent = (
    <ul role="list" className="flex flex-col p-2">
      {reports.map((report) => {
        const meta = CATEGORY_META[report.category];
        const isSelected = report.id === selectedId;

        return (
          <li key={report.id}>
            <button
              type="button"
              onClick={() => handleSelectReport(report.id)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                /* min-h-[56px] ensures 44px+ tap target on mobile */
                "w-full text-left flex flex-col gap-1 min-h-[56px] py-3 px-3 rounded-md transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e]",
                isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03] active:bg-white/[0.05]",
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
          </li>
        );
      })}
    </ul>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 animate-in fade-in duration-200">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reports explorer"
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reports explorer"
          className={cn(
            "absolute inset-2 sm:inset-4 lg:inset-6 flex flex-col overflow-hidden text-zinc-100",
            "rounded-2xl border border-white/[0.06] bg-[#1c1c1e]",
            "shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]",
            "origin-top-right animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none",
          )}
        >
          <header className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-white/[0.06]">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[16px] sm:text-[17px] font-semibold text-white">Reports</h2>
              <span className="text-[13px] text-zinc-500 tabular-nums">
                {reports.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 -m-1.5 inline-flex h-11 w-11 items-center justify-center text-zinc-400 hover:text-white rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </header>

          <div className="flex flex-1 min-h-0">
            {/* List — full width on mobile, fixed sidebar on md+ */}
            <div className="w-full md:w-[340px] lg:w-[380px] flex-shrink-0 md:border-r md:border-white/[0.06] overflow-y-auto custom-scrollbar pb-safe">
              {reportListContent}
            </div>

            {/* Detail panel — hidden on mobile (uses Drawer instead), visible md+ */}
            <div className="hidden md:flex flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 pb-safe">
              <div className="flex-1">
                <ReportDetail report={selectedReport} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only: report detail in a Drawer */}
      <Drawer
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        title={selectedReport ? CATEGORY_META[selectedReport.category]?.label ?? "Report" : "Report"}
        side="right"
      >
        <ReportDetail report={selectedReport} />
      </Drawer>
    </>,
    document.body,
  );
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

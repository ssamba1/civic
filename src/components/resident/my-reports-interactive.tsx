"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Stat,
  StatGrid,
  PillGroup,
  EmptyState,
} from "@/components/analytics/bento-primitives";
import { RecentReports } from "@/components/dashboard/recent-reports";
import type { DashboardReport } from "@/lib/dashboard-data";

type FilterValue = "all" | "active" | "resolved";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
];

// Active = still moving through the pipeline; resolved = closed.
const ACTIVE_STATUSES = new Set(["open", "dispatched", "in_progress"]);

export function MyReportsInteractive({
  reports,
}: {
  reports: DashboardReport[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>("all");

  const summary = useMemo(() => {
    const total = reports.length;
    const active = reports.filter((r) => ACTIVE_STATUSES.has(r.status)).length;
    const resolved = reports.filter((r) => r.status === "closed").length;
    const pctResolved = total === 0 ? 0 : Math.round((resolved / total) * 100);
    return { total, active, resolved, pctResolved };
  }, [reports]);

  const visible = useMemo(() => {
    if (filter === "active") {
      return reports.filter((r) => ACTIVE_STATUSES.has(r.status));
    }
    if (filter === "resolved") {
      return reports.filter((r) => r.status === "closed");
    }
    return reports;
  }, [reports, filter]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Status summary — celebrate the resident's civic footprint.
          On mobile the stats stack 2×2 naturally via StatGrid; padding
          tightened slightly so the card breathes without eating too much
          vertical real-estate on small screens. */}
      <div className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)] sm:p-5">
        <StatGrid>
          <Stat
            label="Total filed"
            value={String(summary.total)}
            hint={
              summary.total === 1
                ? "Your first report is on the board."
                : "Every one moves the city forward."
            }
          />
          <Stat
            label="Being worked on"
            value={String(summary.active)}
            hint={
              summary.active === 0
                ? "Nothing pending — all caught up."
                : "Crews are on it."
            }
          />
          <Stat
            label="Resolved"
            value={String(summary.resolved)}
            hint={
              summary.resolved === 0
                ? "First fix coming soon."
                : "Fixed and behind you."
            }
          />
          <Stat
            label="% resolved"
            value={`${summary.pctResolved}%`}
            hint={
              summary.pctResolved >= 50
                ? "Strong follow-through."
                : "Momentum building."
            }
          />
        </StatGrid>
      </div>

      {/* Filter control row — full-width on mobile so pills are easy to tap,
          right-aligned on sm+ to match the original desktop layout. */}
      <div className="flex items-center justify-start sm:justify-end">
        <PillGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* RecentReports is its own bordered panel — render it standalone.
          On mobile let it grow freely (no max-height cap) so the user
          doesn't need to scroll within a scrolling container; on sm+
          restore the 640px cap. */}
      {visible.length === 0 ? (
        <div className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <EmptyState
            message={
              reports.length === 0
                ? "You haven't filed any reports yet."
                : filter === "resolved"
                  ? "No resolved reports yet — they'll land here once crews wrap up."
                  : "Nothing active right now — you're all caught up."
            }
          />
        </div>
      ) : (
        <RecentReports
          reports={visible}
          maxHeightClass="max-h-none sm:max-h-[640px]"
          onClickReport={(id) => router.push(`/user/my-reports/${id}`)}
        />
      )}
    </div>
  );
}

"use client";

import { memo } from "react";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { TeamWorkload } from "@/lib/teams-data";
import {
  useHoverTip,
  TipRow,
  TipChip,
} from "@/components/analytics/hover-tip";
import { Tile } from "@/components/analytics/bento-primitives";
import { cn } from "@/lib/utils/cn";
import { stackedBarGradient } from "@/lib/utils/stacked-bar";

/* ==================================================================
   Horizontal stacked bar per team, scaled to the heaviest-loaded team
   so volume reads at a glance. Segments encode status mix. Sorted by
   open backlog descending. Clicking a row scopes the shared filter.
   ================================================================== */

interface WorkloadBarsProps {
  workloads: TeamWorkload[];
  selectedTeam: TeamId;
  onSelectTeam: (teamId: TeamId) => void;
}

const STATUS_PALETTE = {
  open: "#ff9f0a",
  dispatched: "#0a84ff",
  in_progress: "#5ac8fa",
  closed: "#30d158",
  merged: "#86868b",
  rejected: "#ff453a",
} as const;

const STATUS_LABEL = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Closed",
  merged: "Merged",
  rejected: "Rejected",
} as const;

function WorkloadBarsInner({
  workloads,
  selectedTeam,
  onSelectTeam,
}: WorkloadBarsProps) {
  const tip = useHoverTip();
  const maxTotal = Math.max(1, ...workloads.map((w) => w.total));
  const populated = workloads.filter((w) => w.total > 0);
  const rows = populated.length > 0 ? populated : workloads;

  return (
    <Tile
      title="Workload distribution"
      subtitle={`${rows.length} teams · scaled to busiest`}
    >
      <ul className="flex flex-col gap-2">
        {rows.map((w) => {
          const team = TEAMS[w.teamId];
          const widthPct = (w.total / maxTotal) * 100;
          const isSelected = selectedTeam === w.teamId;
          const isDimmed = selectedTeam !== "all" && !isSelected;
          const { onClick: tipOnClick, ...tipRest } = tip.bindTarget(() => buildTip(w));
          return (
            <li key={w.teamId}>
              <button
                type="button"
                onClick={(e) => { tipOnClick?.(e); onSelectTeam(w.teamId); }}
                aria-pressed={isSelected}
                aria-label={`Scope view to ${team.label}`}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_56px] items-center gap-2",
                  "sm:grid-cols-[140px_minmax(0,1fr)_56px] sm:gap-3",
                  "rounded-md px-2 py-2.5 -mx-2 text-left transition-colors min-h-[44px]",
                  "outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-white/20",
                  isSelected ? "bg-white/[0.05]" : "hover:bg-white/[0.03]",
                  isDimmed && "opacity-50",
                )}
                {...tipRest}
              >
                {/* Label: hidden on mobile (bar+count only); shown sm+ */}
                <span className="hidden sm:flex min-w-0 items-center gap-2 text-[12px] text-zinc-300">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: team.color }}
                    aria-hidden
                  />
                  <span className="truncate">{team.shortLabel}</span>
                </span>
                {/* Mobile-only label + bar stacked */}
                <div className="flex flex-col gap-1 sm:hidden col-span-1">
                  <span className="flex min-w-0 items-center gap-2 text-[12px] text-zinc-300">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: team.color }}
                      aria-hidden
                    />
                    <span className="truncate">{team.shortLabel}</span>
                  </span>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    <StackedSegments byStatus={w.byStatus} widthPct={widthPct} />
                  </div>
                </div>
                {/* sm+ bar (middle column) */}
                <div className="relative hidden sm:block h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                  <StackedSegments byStatus={w.byStatus} widthPct={widthPct} />
                </div>
                <span className="text-right text-[12px] tabular-nums text-zinc-400">
                  {w.total.toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Legend />
      <tip.Portal />
    </Tile>
  );
}

interface StackedSegmentsProps {
  byStatus: TeamWorkload["byStatus"];
  widthPct: number;
}

function StackedSegments({ byStatus, widthPct }: StackedSegmentsProps) {
  const gradient = stackedBarGradient(
    (Object.keys(STATUS_PALETTE) as Array<keyof typeof STATUS_PALETTE>).map(
      (status) => ({ value: byStatus[status] ?? 0, color: STATUS_PALETTE[status] }),
    ),
  );
  if (!gradient) return null;
  return (
    <div
      className="h-full rounded-full"
      style={{ width: `${widthPct}%`, background: gradient }}
    />
  );
}

function Legend() {
  const items: Array<keyof typeof STATUS_PALETTE> = [
    "open",
    "dispatched",
    "in_progress",
    "closed",
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-500">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS_PALETTE[s] }}
            aria-hidden
          />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function buildTip(w: TeamWorkload) {
  const team = TEAMS[w.teamId];
  const closureRate =
    w.total > 0 ? Math.round((w.closedCount / w.total) * 100) : 0;
  return {
    title: team.shortLabel,
    accent: team.color,
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Total"
          value={w.total.toLocaleString()}
          accent={team.color}
        />
        <TipRow
          label="Open"
          value={w.openCount.toLocaleString()}
          accent={STATUS_PALETTE.open}
        />
        <TipRow
          label="Closed"
          value={w.closedCount.toLocaleString()}
          accent={STATUS_PALETTE.closed}
        />
        <TipRow
          label="MTTR"
          value={w.mttrHours !== null ? `${w.mttrHours}h` : "—"}
          muted
        />
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>Closure rate</span>
        <TipChip
          tone={closureRate >= 60 ? "good" : closureRate >= 30 ? "warn" : "bad"}
        >
          {closureRate}%
        </TipChip>
      </div>
    ),
  };
}

export const WorkloadBars = memo(WorkloadBarsInner);

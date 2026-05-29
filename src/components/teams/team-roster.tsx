"use client";

import { memo } from "react";
import { Clock, Timer } from "lucide-react";
import { TEAMS, type TeamId } from "@/lib/teams";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { TeamWorkload } from "@/lib/teams-data";
import { teamIcon } from "@/components/teams/team-icon";
import {
  useHoverTip,
  TipRow,
  TipChip,
} from "@/components/analytics/hover-tip";
import { useReveal } from "@/components/analytics/bento-primitives";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Team roster — grid of team cards, sorted by open backlog.
   Each card surfaces total assigned, status mix mini-bar, oldest open
   age, MTTR, and a hover tip with team duties + top category.
   Clicking a card scopes the shared filter to that team.
   ================================================================== */

interface TeamRosterProps {
  workloads: TeamWorkload[];
  selectedTeam: TeamId;
  onSelectTeam: (teamId: TeamId) => void;
}

const STATUS_COLORS = {
  open: "#ff9f0a",
  dispatched: "#0a84ff",
  in_progress: "#5ac8fa",
  closed: "#30d158",
  merged: "#86868b",
  rejected: "#ff453a",
} as const;

function TeamRosterInner({
  workloads,
  selectedTeam,
  onSelectTeam,
}: TeamRosterProps) {
  const tip = useHoverTip();
  const ref = useReveal<HTMLDivElement>();

  return (
    <>
      <div
        ref={ref}
        data-bento-reveal
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {workloads.map((w) => (
          <TeamCard
            key={w.teamId}
            workload={w}
            isSelected={selectedTeam === w.teamId}
            isDimmed={selectedTeam !== "all" && selectedTeam !== w.teamId}
            onSelect={() => onSelectTeam(w.teamId)}
            tipBindings={tip.bindTarget(() => buildTip(w))}
          />
        ))}
      </div>
      <tip.Portal />
    </>
  );
}

function buildTip(w: TeamWorkload) {
  const team = TEAMS[w.teamId];
  const topCatLabel = w.topCategory
    ? CATEGORY_META[w.topCategory].label
    : "—";
  const closureRate =
    w.total > 0 ? Math.round((w.closedCount / w.total) * 100) : 0;
  return {
    title: team.label,
    accent: team.color,
    body: (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-zinc-500 leading-snug">
          {team.duties}
        </p>
        <TipRow
          label="Open backlog"
          value={w.openCount.toLocaleString()}
          accent={STATUS_COLORS.open}
        />
        <TipRow
          label="Closed"
          value={w.closedCount.toLocaleString()}
          accent={STATUS_COLORS.closed}
        />
        <TipRow label="Top category" value={topCatLabel} muted />
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

interface TeamCardProps {
  workload: TeamWorkload;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: () => void;
  tipBindings: ReturnType<ReturnType<typeof useHoverTip>["bindTarget"]>;
}

function TeamCard({
  workload,
  isSelected,
  isDimmed,
  onSelect,
  tipBindings,
}: TeamCardProps) {
  const team = TEAMS[workload.teamId];
  const Icon = teamIcon(team.icon);
  const { open, dispatched, in_progress, closed } = workload.byStatus;
  const oldestLabel =
    workload.oldestOpenAgeDays !== null
      ? formatDays(workload.oldestOpenAgeDays)
      : "—";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`Scope view to ${team.label}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-[14px] border bg-[#1c1c1e] p-4 text-left",
        "shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-all duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        isSelected
          ? "border-white/[0.18]"
          : "border-white/[0.06] hover:border-white/[0.12]",
        isDimmed && "opacity-55",
      )}
      style={
        isSelected
          ? { boxShadow: `0 0 0 1px ${team.color}66, 0 8px 24px ${team.color}22` }
          : undefined
      }
      {...tipBindings}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
            style={{ background: `${team.color}1a`, color: team.color }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="truncate text-[13px] font-medium text-white">
            {team.shortLabel}
          </span>
        </div>
        <span className="text-[24px] font-semibold tracking-tight text-white tabular-nums leading-none">
          {workload.total}
        </span>
      </header>

      <StatusMiniBar
        segments={[
          { value: open, color: STATUS_COLORS.open, label: "open" },
          {
            value: dispatched,
            color: STATUS_COLORS.dispatched,
            label: "dispatched",
          },
          {
            value: in_progress,
            color: STATUS_COLORS.in_progress,
            label: "in progress",
          },
          { value: closed, color: STATUS_COLORS.closed, label: "closed" },
        ]}
      />

      <footer className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          oldest {oldestLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3 w-3" strokeWidth={1.75} />
          MTTR {workload.mttrHours !== null ? `${workload.mttrHours}h` : "—"}
        </span>
      </footer>
    </button>
  );
}

interface StatusMiniBarProps {
  segments: { value: number; color: string; label: string }[];
}

function StatusMiniBar({ segments }: StatusMiniBarProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-white/[0.05]" />;
  }
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]"
      role="img"
      aria-label={segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.value} ${s.label}`)
        .join(", ")}
    >
      {segments.map((seg) =>
        seg.value > 0 ? (
          <div
            key={seg.label}
            className="h-full"
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: seg.color,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

function formatDays(d: number): string {
  if (d < 1) return "<1d";
  if (d < 30) return `${Math.round(d)}d`;
  const months = Math.round(d / 30);
  return `${months}mo`;
}

export const TeamRoster = memo(TeamRosterInner);

"use client";

import { ArrowUpRight, Clock, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { memo, useState } from "react";
import { useReveal } from "@/components/analytics/bento-primitives";
import { TipChip, TipRow, useHoverTip } from "@/components/analytics/hover-tip";
import {
  formatDays,
  STATUS_COLORS,
  StatusMiniBar,
} from "@/components/teams/status-mini-bar";
import { teamIcon } from "@/components/teams/team-icon";
import { TeamSetupModal } from "@/components/teams/team-setup-modal";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { TeamWorkload } from "@/lib/teams-data";
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

function TeamRosterInner({
  workloads,
  selectedTeam,
  onSelectTeam,
}: TeamRosterProps) {
  const tip = useHoverTip();
  const ref = useReveal<HTMLDivElement>();
  const [setupOpen, setSetupOpen] = useState(false);
  // Current city slug from the /city/[slug] route — feeds the per-card
  // "View team" link that drills into /[team]/[city].
  const { slug } = useParams<{ slug: string }>();

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
            citySlug={slug}
            isSelected={selectedTeam === w.teamId}
            isDimmed={selectedTeam !== "all" && selectedTeam !== w.teamId}
            onSelect={() => onSelectTeam(w.teamId)}
            tipBindings={tip.bindTarget(() => buildTip(w))}
          />
        ))}
        <AddTeamCard onClick={() => setSetupOpen(true)} />
      </div>
      <tip.Portal />
      <TeamSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
    </>
  );
}

function buildTip(w: TeamWorkload) {
  const team = TEAMS[w.teamId];
  const topCatLabel = w.topCategory ? CATEGORY_META[w.topCategory].label : "—";
  const closureRate =
    w.total > 0 ? Math.round((w.closedCount / w.total) * 100) : 0;
  return {
    title: team.label,
    accent: team.color,
    body: (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-faint leading-snug">{team.duties}</p>
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
  citySlug: string;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: () => void;
  tipBindings: ReturnType<ReturnType<typeof useHoverTip>["bindTarget"]>;
}

function TeamCard({
  workload,
  citySlug,
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

  const { onClick: tipOnClick, ...tipRest } = tipBindings;
  // Two interactive children, never nested: a full-bleed button (scope toggle)
  // beneath the content, and a "View team" link on top (z-10) that drills into
  // the dedicated /[team]/[city] dashboard. The container div stays inert so
  // biome's a11y rules don't demand a role/keyboard handler on it.
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-[var(--radius-lg)] border bg-surface p-4 text-left",
        "shadow-[var(--shadow-card)] transition-all duration-150 will-change-transform active:scale-[0.97] motion-reduce:active:scale-100",
        isSelected
          ? "border-hairline-strong bg-elevated scale-[1.01] motion-reduce:scale-100"
          : "border-hairline hover:border-hairline-strong",
        isDimmed && "opacity-55",
      )}
      style={
        isSelected
          ? {
              boxShadow: `0 0 0 1px ${team.color}66, 0 8px 24px ${team.color}22`,
            }
          : undefined
      }
    >
      {/* Primary action — scope the page to this team (local highlight +
          delegation narrowing). Full-bleed and underneath, so any click that
          isn't the View link toggles scope. Carries the hover-tip handlers. */}
      <button
        type="button"
        onClick={(e) => {
          tipOnClick?.(e);
          onSelect();
        }}
        aria-pressed={isSelected}
        aria-label={`Scope view to ${team.label}`}
        className="absolute inset-0 z-0 rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        {...tipRest}
      />

      {/* Content — non-interactive so clicks fall through to the scope button. */}
      <header className="pointer-events-none relative z-0 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
            style={{ background: `${team.color}1a`, color: team.color }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="truncate text-[13.5px] font-medium text-foreground">
            {team.shortLabel}
          </span>
        </div>
        <span className="text-[24px] font-semibold tracking-tight text-foreground tabular-nums leading-none">
          {workload.total}
        </span>
      </header>

      <div className="pointer-events-none relative z-0">
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
      </div>

      <footer className="pointer-events-none relative z-0 flex items-center justify-between gap-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          oldest {oldestLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3 w-3" strokeWidth={1.75} />
          MTTR {workload.mttrHours !== null ? `${workload.mttrHours}h` : "—"}
        </span>
      </footer>

      {/* Drill into the team's own dashboard. Above the scope button (z-10)
          with its own pointer events, so it intercepts the click. */}
      <Link
        href={`/city/${citySlug}/team/${workload.teamId}`}
        aria-label={`View team dashboard for ${team.label}`}
        className={cn(
          "relative z-10 mt-0.5 flex w-full items-center justify-between gap-1 rounded-lg px-2.5 py-1.5",
          "border border-hairline bg-overlay text-[11px] font-medium text-subtle",
          "outline-none transition-colors hover:border-hairline-strong hover:bg-overlay-strong hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span>View team</span>
        <ArrowUpRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={2}
        />
      </Link>
    </div>
  );
}

function AddTeamCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed p-4 text-left",
        "border-hairline bg-surface shadow-[var(--shadow-card)]",
        "transition-all duration-150 hover:border-hairline-strong hover:bg-overlay",
        "outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "min-h-[108px]",
      )}
      aria-label="Set up a new team"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong bg-overlay text-subtle transition-colors group-hover:border-hairline-strong group-hover:text-foreground">
        <Plus className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="text-[12px] font-medium text-faint transition-colors group-hover:text-subtle">
        Add Team
      </span>
    </button>
  );
}

export const TeamRoster = memo(TeamRosterInner);

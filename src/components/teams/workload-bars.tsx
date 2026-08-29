"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { memo, useRef } from "react";
import { Tile } from "@/components/analytics/bento-primitives";
import { TipChip, TipRow, useHoverTip } from "@/components/analytics/hover-tip";
import { STATUS_LABEL } from "@/lib/status";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { TeamWorkload } from "@/lib/teams-data";
import { cn } from "@/lib/utils/cn";
import { stackedBarLayers } from "@/lib/utils/stacked-bar";

/* ==================================================================
   Horizontal stacked bar per team, scaled to the heaviest-loaded team
   so volume reads at a glance. Segments encode status mix. Sorted by
   open backlog descending. Clicking a row scopes the shared filter.
   ================================================================== */

interface WorkloadBarsProps {
  workloads: TeamWorkload[];
  selectedTeam: TeamId;
  onSelectTeam: (teamId: TeamId) => void;
  // When false (scoped single-team dashboard), rows render as informational:
  // no scope-toggle semantics, no stuck-selected fill, no hover-as-selection.
  selectable?: boolean;
}

// Mirrors STATUS_COLORS in status-mini-bar.tsx (kept byte-identical).
// Deliberately diverges from lib/status.ts's STATUS_TONE: chips encode status
// via TEXT (a11y-tuned per-theme fg tokens), this bar encodes status via FILL
// AREA — different constraint, so a separate local map. Pastel efferd ramp:
// open = butter-strong (warning-ish, the one actionable state, pops);
// dispatched/in_progress share the sky (info) hue — dispatched is a
// color-mix-softened sky, in_progress full sky-strong, so their relative
// weight ordering holds in both themes without raw hex. Segments overpaint
// each other (absolute right-0 layers), and the raw --pastel-* soft tokens
// are alpha in dark mode, so every fill must stay opaque: color-mix against
// --surface stands in for "soft". closed = softened mint (success-ish) that
// still recedes; merged stays neutral gray; rejected = blush-strong.
const STATUS_PALETTE = {
  open: "var(--pastel-butter-strong)",
  dispatched:
    "color-mix(in srgb, var(--pastel-sky-strong) 45%, var(--surface))",
  in_progress: "var(--pastel-sky-strong)",
  closed: "color-mix(in srgb, var(--pastel-mint-strong) 40%, var(--surface))",
  merged: "var(--color-muted)",
  rejected: "var(--pastel-blush-strong)",
} as const;

function WorkloadBarsInner({
  workloads,
  selectedTeam,
  onSelectTeam,
  selectable = true,
}: WorkloadBarsProps) {
  const tip = useHoverTip();
  const maxTotal = Math.max(1, ...workloads.map((w) => w.total));
  const populated = workloads.filter((w) => w.total > 0);
  const rows = populated.length > 0 ? populated : workloads;

  // Draw the bars left-to-right on mount: scaleX 0 → 1, staggered 40ms per row.
  // transform-only (no layout) and reduced-motion users see them at full width
  // instantly. Runs once — keyed off row count so a data swap re-plays cleanly.
  const listRef = useRef<HTMLUListElement>(null);
  useGSAP(
    () => {
      const bars =
        listRef.current?.querySelectorAll<HTMLElement>("[data-wl-bar]");
      if (!bars || bars.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(bars, {
          scaleX: 0,
          transformOrigin: "left center",
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.04,
        });
      });
      return () => mm.revert();
    },
    { dependencies: [rows.length] },
  );

  return (
    <Tile
      title="Workload distribution"
      subtitle={
        rows.length === 1
          ? "1 team"
          : `${rows.length} teams · scaled to busiest`
      }
    >
      <ul ref={listRef} className="flex flex-col gap-2">
        {rows.map((w) => {
          const team = TEAMS[w.teamId];
          const widthPct = (w.total / maxTotal) * 100;
          const isSelected = selectable && selectedTeam === w.teamId;
          const isDimmed = selectable && selectedTeam !== "all" && !isSelected;
          const { onClick: tipOnClick, ...tipRest } = tip.bindTarget(() =>
            buildTip(w),
          );
          return (
            <li key={w.teamId}>
              <button
                type="button"
                onClick={(e) => {
                  tipOnClick?.(e);
                  if (selectable) onSelectTeam(w.teamId);
                }}
                aria-pressed={selectable ? isSelected : undefined}
                // No aria-label: the button's own content (team name + workload
                // count) is the accessible name. A "Scope view to …" aria-label
                // would not contain the visible numeric count, tripping WCAG
                // 2.5.3 (label-content-name-mismatch). aria-pressed conveys the
                // toggle. title (via tipRest) still gives the hover hint.
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_56px] items-center gap-2",
                  "sm:grid-cols-[140px_minmax(0,1fr)_56px] sm:gap-3",
                  "rounded-md px-2 py-2.5 -mx-2 text-left transition-colors min-h-[44px]",
                  "outline-none focus-visible:bg-overlay focus-visible:ring-1 focus-visible:ring-hairline-strong",
                  isSelected
                    ? "bg-overlay"
                    : selectable
                      ? "hover:bg-overlay"
                      : "",
                  isDimmed && "opacity-50",
                )}
                {...tipRest}
              >
                {/* Label: hidden on mobile (bar+count only); shown sm+ */}
                <span className="hidden sm:flex min-w-0 items-center gap-2 text-[12px] text-subtle">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: team.color }}
                    aria-hidden
                  />
                  <span className="truncate">{team.shortLabel}</span>
                </span>
                {/* Mobile-only label + bar stacked */}
                <div className="flex flex-col gap-1 sm:hidden col-span-1">
                  <span className="flex min-w-0 items-center gap-2 text-[12px] text-subtle">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: team.color }}
                      aria-hidden
                    />
                    <span className="truncate">{team.shortLabel}</span>
                  </span>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-overlay">
                    <StackedSegments
                      byStatus={w.byStatus}
                      widthPct={widthPct}
                    />
                  </div>
                </div>
                {/* sm+ bar (middle column) */}
                <div className="relative hidden sm:block h-3 w-full overflow-hidden rounded-full bg-overlay">
                  <StackedSegments byStatus={w.byStatus} widthPct={widthPct} />
                </div>
                <span className="text-right text-[12px] tabular-nums text-subtle">
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
  const layers = stackedBarLayers(
    (Object.keys(STATUS_PALETTE) as Array<keyof typeof STATUS_PALETTE>).map(
      (status) => ({
        value: byStatus[status] ?? 0,
        color: STATUS_PALETTE[status],
      }),
    ),
  );
  if (layers.length === 0) return null;
  return (
    <div
      data-wl-bar
      className="relative h-full overflow-hidden rounded-full will-change-transform"
      style={{ width: `${widthPct}%` }}
    >
      {layers.map((l) => (
        <span
          key={`${l.color}-${l.startPct}`}
          className="absolute inset-y-0 right-0"
          style={{ left: `${l.startPct}%`, background: l.color }}
          aria-hidden
        />
      ))}
    </div>
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
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-faint">
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
  // Softened toward the surface — quiet identity cue, not a saturated edge.
  // Mirrors team-roster's buildTip so both tips read identically.
  const softAccent = `color-mix(in srgb, ${team.color} 60%, var(--surface))`;
  return {
    title: team.shortLabel,
    accent: softAccent,
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Total"
          value={w.total.toLocaleString()}
          accent={softAccent}
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

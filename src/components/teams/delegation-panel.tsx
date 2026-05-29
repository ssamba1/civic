"use client";

import { memo, useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronDown, Clock, RotateCcw } from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { categoryToTeam, type TeamId } from "@/lib/teams";
import { useCategoryOverrides } from "@/lib/category-overrides";
import type { ReportStatus } from "@/lib/types";
import type { OverrideEvent } from "@/lib/delegation-history";
import type { TeamWorkload } from "@/lib/teams-data";
import { TeamPicker } from "@/components/teams/team-picker";
import {
  DelegationRowExpanded,
  type ReasoningData,
} from "@/components/teams/delegation-row-expanded";
import { Tile } from "@/components/analytics/bento-primitives";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

gsap.registerPlugin(useGSAP);

/* ==================================================================
   Delegation panel — list of reports with a team-reassign control on
   each row. Default team (from category routing) is shown muted; the
   live assignment is shown bright. Picking a new team writes a per-
   report override (localStorage); clicking "reset" clears it.

   Each row is expandable: clicking the trigger area reveals the
   DelegationRowExpanded panel (photo, AI reasoning, stats, timeline).
   A reasoning cache lives at the panel level so the AI call survives
   collapse/expand cycles without re-firing.
   ================================================================== */

interface DelegationPanelProps {
  reports: DashboardReport[];
  overrides: Record<string, TeamId>;
  history: Record<string, OverrideEvent[]>;
  corpus: DashboardReport[];
  workloads: Map<TeamId, TeamWorkload>;
  setReportTeam: (
    report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
    teamId: TeamId,
  ) => void;
  clearReportTeam: (
    report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
  ) => void;
  limit?: number;
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
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

function DelegationPanelInner({
  reports,
  overrides,
  history,
  corpus,
  workloads,
  setReportTeam,
  clearReportTeam,
  limit = 30,
}: DelegationPanelProps) {
  // Subscribe to category-level overrides so the "default team" column
  // re-renders when a dispatcher re-aims a whole category from the
  // routing matrix. We don't read the value — `categoryToTeam` already
  // consults the module-level snapshot — but the subscription is what
  // forces this memo'd tree back through commit.
  useCategoryOverrides();

  // Reasoning cache survives row collapse/expand. Keyed by report id.
  // Lives in a ref so populating it doesn't trigger re-renders of
  // siblings; the row that owns each entry pulls from it on mount.
  const reasoningCacheRef = useRef<Map<string, ReasoningData>>(new Map());
  const setReasoningCache = useCallback(
    (id: string, data: ReasoningData) => {
      reasoningCacheRef.current.set(id, data);
    },
    [],
  );

  const sliced = reports.slice(0, limit);
  const overrideCount = sliced.filter((r) => overrides[r.id]).length;

  return (
    <Tile
      title="Delegation"
      subtitle={
        overrideCount > 0
          ? `${sliced.length} shown · ${overrideCount} overridden`
          : `${sliced.length} shown`
      }
    >
      {sliced.length === 0 ? (
        <p className="text-[13px] text-zinc-500">
          No reports match the current filters.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.04]">
          {sliced.map((r) => (
            <DelegationRow
              key={r.id}
              report={r}
              override={overrides[r.id]}
              history={history[r.id] ?? []}
              corpus={corpus}
              workloads={workloads}
              reasoningCache={reasoningCacheRef.current}
              setReasoningCache={setReasoningCache}
              onReassign={(teamId) => setReportTeam(r, teamId)}
              onClear={() => clearReportTeam(r)}
            />
          ))}
        </ul>
      )}
    </Tile>
  );
}

interface DelegationRowProps {
  report: DashboardReport;
  override: TeamId | undefined;
  history: OverrideEvent[];
  corpus: DashboardReport[];
  workloads: Map<TeamId, TeamWorkload>;
  reasoningCache: Map<string, ReasoningData>;
  setReasoningCache: (id: string, data: ReasoningData) => void;
  onReassign: (teamId: TeamId) => void;
  onClear: () => void;
}

function DelegationRow({
  report,
  override,
  history,
  corpus,
  workloads,
  reasoningCache,
  setReasoningCache,
  onReassign,
  onClear,
}: DelegationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  const meta = CATEGORY_META[report.category];
  const defaultTeam = categoryToTeam(report.category);
  const effectiveTeam = override ?? defaultTeam;
  const isOverridden = override !== undefined && override !== defaultTeam;

  // GSAP height collapse/expand. Animates 0 ↔ auto (CSS can't tween to auto).
  // Runs in a layout effect (pre-paint) so the mount set never flashes.
  // Animates regardless of prefers-reduced-motion — this is an explicitly
  // requested, low-amplitude height tween, and the project owner runs the OS
  // with reduce-motion on but wants the motion here (see the hero wave).
  useGSAP(
    () => {
      const el = contentRef.current;
      if (!el) return;

      if (firstRun.current) {
        firstRun.current = false;
        gsap.set(el, expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 });
        return;
      }

      gsap.to(el, {
        height: expanded ? "auto" : 0,
        opacity: expanded ? 1 : 0,
        duration: expanded ? 0.34 : 0.26,
        ease: expanded ? "power3.out" : "power2.inOut",
        overwrite: true,
      });
    },
    { dependencies: [expanded] },
  );

  // Swallow click + key events on interactive sub-controls so they
  // don't toggle the row.
  const stopRowToggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <li className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`delegation-row-${report.id}`}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="-mx-2 grid cursor-pointer grid-cols-1 items-center gap-2 rounded-md px-2 py-3 transition-colors hover:bg-white/[0.015] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-3 min-h-[44px]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: meta.color }}
            aria-hidden
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[13px] font-medium text-white">
              {meta.label}
              <span className="ml-2 text-[12px] font-normal text-zinc-500">
                {report.address}
              </span>
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  STATUS_TONE[report.status],
                )}
              >
                {STATUS_LABEL[report.status]}
              </span>
              <span>Sev {report.severity}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" strokeWidth={1.75} />
                {timeAgo(report.created_at)}
              </span>
            </p>
          </div>
        </div>

        {/* Mobile: controls grouped in one flex row (col-span-1); chevron sits
            outside the stopRowToggle wrapper so tapping it still toggles the row.
            sm+: each child is its own grid column (auto). */}
        <div className="flex items-center justify-between sm:hidden">
          <div
            className="flex items-center gap-1"
            onClick={stopRowToggle}
            onKeyDown={stopRowToggle}
          >
            <TeamPicker
              currentTeam={effectiveTeam}
              defaultTeam={defaultTeam}
              onChange={onReassign}
              align="left"
            />
            <button
              type="button"
              onClick={onClear}
              disabled={!isOverridden}
              title={
                isOverridden ? "Revert to default routing" : "Default routing"
              }
              aria-label="Reset team assignment to default"
              className={cn(
                "inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md transition-colors",
                isOverridden
                  ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  : "text-zinc-700",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          {/* Chevron outside stopRowToggle so tapping it reliably toggles expansion */}
          <span
            aria-hidden
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center text-zinc-500 transition-transform duration-300",
              expanded && "rotate-180",
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>

        {/* sm+: individual grid columns */}
        <div
          className="hidden sm:block"
          onClick={stopRowToggle}
          onKeyDown={stopRowToggle}
        >
          <TeamPicker
            currentTeam={effectiveTeam}
            defaultTeam={defaultTeam}
            onChange={onReassign}
            align="right"
          />
        </div>

        <div
          className="hidden sm:block"
          onClick={stopRowToggle}
          onKeyDown={stopRowToggle}
        >
          <button
            type="button"
            onClick={onClear}
            disabled={!isOverridden}
            title={
              isOverridden ? "Revert to default routing" : "Default routing"
            }
            aria-label="Reset team assignment to default"
            className={cn(
              "inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors",
              isOverridden
                ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                : "text-zinc-700",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <span
          aria-hidden
          className={cn(
            "hidden sm:inline-flex h-6 w-6 items-center justify-center text-zinc-500 transition-transform duration-300",
            expanded && "rotate-180",
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>

      <div
        ref={contentRef}
        id={`delegation-row-${report.id}`}
        role="region"
        className="row-collapsible"
      >
        <DelegationRowExpanded
          report={report}
          effectiveTeam={effectiveTeam}
          defaultTeam={defaultTeam}
          history={history}
          corpus={corpus}
          workloads={workloads}
          reasoningCache={reasoningCache}
          setReasoningCache={setReasoningCache}
        />
      </div>
    </li>
  );
}

export const DelegationPanel = memo(DelegationPanelInner);

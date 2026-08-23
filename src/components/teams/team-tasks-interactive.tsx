"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  TaskDetailPane,
  TeamTaskDetail,
} from "@/components/teams/team-task-detail";
import { ResizableSplit } from "@/components/ui/resizable-split";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useReportCorpus } from "@/lib/filters/context";
import { STATUS_LABEL, STATUS_TONE, toneTextClass } from "@/lib/status";
import type { TeamId } from "@/lib/teams";
import { getReportTeam } from "@/lib/teams-overrides";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

const ACTIVE_STATUSES = new Set<ReportStatus>([
  "open",
  "dispatched",
  "in_progress",
]);

type Tab = "todo" | "done" | "all";

interface TeamTasksInteractiveProps {
  teamId: TeamId;
}

export function TeamTasksInteractive({ teamId }: TeamTasksInteractiveProps) {
  const corpus = useReportCorpus();
  const [tab, setTab] = useState<Tab>("todo");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // md+ gets the inline resizable split; narrower screens get the portal sheet.
  // Selecting a task only happens post-hydration, so the false default never
  // flashes the wrong detail surface.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // This team's full backlog (all statuses, all time), completion-resolved.
  const teamReports = useMemo(
    () => corpus.filter((r) => getReportTeam(r) === teamId),
    [corpus, teamId],
  );

  const todoCount = useMemo(
    () => teamReports.filter((r) => ACTIVE_STATUSES.has(r.status)).length,
    [teamReports],
  );
  const doneCount = teamReports.length - todoCount;

  const visible = useMemo(() => {
    const inTab = teamReports.filter((r) => {
      if (tab === "todo") return ACTIVE_STATUSES.has(r.status);
      if (tab === "done") return !ACTIVE_STATUSES.has(r.status);
      return true;
    });
    // To-do: worst first (severity), then most recent. Else: most recent.
    return [...inTab].sort((a, b) => {
      if (tab === "todo" && b.severity !== a.severity) {
        return b.severity - a.severity;
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [teamReports, tab]);

  // Look up the selected report from the live (re-resolved) backlog so the
  // detail reflects status/after-photo changes the moment a task is marked done.
  const selected = useMemo(
    () => teamReports.find((r) => r.id === selectedId) ?? null,
    [teamReports, selectedId],
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "todo", label: "To do", count: todoCount },
    { key: "done", label: "Done", count: doneCount },
    { key: "all", label: "All", count: teamReports.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented status toggle */}
      <div
        role="tablist"
        aria-label="Task status"
        className="flex w-full max-w-sm items-center gap-0.5 rounded-[10px] border border-hairline bg-overlay p-0.5"
      >
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]",
              tab === key
                ? "bg-overlay-strong text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]"
                : "text-subtle hover:bg-overlay hover:text-foreground",
            )}
          >
            {label}
            <span className="text-[11px] tabular-nums text-faint">{count}</span>
          </button>
        ))}
      </div>

      {/* List (left) + detail pane (right) — split on md+, stacked sheet below */}
      <ResizableSplit
        active={isDesktop && selected !== null}
        storageKey="civic:team-tasks:split"
        className="gap-1"
        left={
          visible.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-8 text-center">
              <p className="text-sm text-subtle">
                {tab === "todo"
                  ? "No open tasks. Nice — the queue is clear."
                  : tab === "done"
                    ? "No completed tasks yet."
                    : "No tasks for this team."}
              </p>
            </div>
          ) : (
            <div
              key={tab}
              className="fade-up overflow-clip rounded-[var(--radius-lg)] border border-hairline bg-surface"
            >
              {/* Column header — sticky, quiet, Linear-register */}
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-surface px-3 py-1.5 text-[11px] font-medium text-faint">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">Task</span>
                <span className="hidden w-[104px] shrink-0 lg:block">
                  Status
                </span>
                <span className="w-6 shrink-0" aria-hidden />
                <span className="w-[64px] shrink-0 text-right">Age</span>
              </div>
              <ul className="flex flex-col">
                {visible.map((report) => (
                  <TaskRow
                    key={report.id}
                    report={report}
                    selected={report.id === selectedId}
                    onClick={() => setSelectedId(report.id)}
                  />
                ))}
              </ul>
            </div>
          )
        }
        right={
          selected ? (
            <TaskDetailPane
              report={selected}
              onClose={() => setSelectedId(null)}
            />
          ) : null
        }
      />

      {/* Mobile / narrow: detail rides in a portal sheet instead of the split */}
      {!isDesktop && (
        <TeamTaskDetail
          report={selected}
          open={selectedId !== null && selected !== null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// Inner-arc fill fraction per status; -1 = check glyph, -2 = x glyph.
// Inner circle r=2 → circumference ≈ 12.57 for the dasharray math.
const RING_PROGRESS: Record<ReportStatus, number> = {
  open: 0,
  dispatched: 0.25,
  in_progress: 0.5,
  closed: -1,
  merged: 1,
  rejected: -2,
};

const INNER_CIRCUMFERENCE = 2 * Math.PI * 2;

function StatusRing({ status }: { status: ReportStatus }) {
  const progress = RING_PROGRESS[status];

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={cn("shrink-0", toneTextClass(STATUS_TONE[status]))}
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={status === "open" ? "1.4 1.74" : undefined}
      />
      {progress === -1 ? (
        <path
          d="M4.5 7L6.5 9L9.5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : progress === -2 ? (
        <path
          d="M5 5L9 9M9 5L5 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : progress > 0 ? (
        <circle
          cx="7"
          cy="7"
          r="2"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray={`${progress * INNER_CIRCUMFERENCE} 100`}
          transform="rotate(-90 7 7)"
        />
      ) : null}
    </svg>
  );
}

function TaskRow({
  report,
  selected,
  onClick,
}: {
  report: DashboardReport;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[report.category];
  const isDemo = report.demo === true;
  const hasAfter = !!report.afterPhoto;

  return (
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        aria-current={selected}
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]",
          selected
            ? "bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
            : "hover:bg-overlay",
          isDemo && "demo-glow",
        )}
      >
        <span className="flex w-5 shrink-0 items-center justify-center">
          <StatusRing status={report.status} />
        </span>

        {/* Title + address share the flexible cell, single line */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-[13px] font-medium text-foreground">
            {meta.label}
          </span>
          <span className="truncate text-[12px] text-faint">
            {report.address}
          </span>
          {report.status !== "closed" && (
            <Camera
              className="hidden h-3 w-3 shrink-0 self-center text-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block"
              strokeWidth={1.75}
            />
          )}
        </span>

        <span className="hidden w-[104px] shrink-0 truncate text-[12px] text-subtle lg:block">
          {STATUS_LABEL[report.status]}
        </span>

        {/* Thumbnail — compact evidence cell */}
        <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-hairline bg-overlay">
          {/* biome-ignore lint/performance/noImgElement: tiny lazy thumbnail; next/image is overkill for a 24px list cell. */}
          <img
            src={report.photo_public_url || undefined}
            alt={`${meta.label} report photo, ${report.address}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {hasAfter && (
            <span className="absolute inset-0 inline-flex items-center justify-center bg-[color-mix(in_srgb,var(--color-success)_55%,transparent)] text-white">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
            </span>
          )}
        </span>

        <span className="w-[64px] shrink-0 text-right text-[11px] tabular-nums text-faint">
          {timeAgo(report.created_at)}
        </span>
      </button>
    </li>
  );
}

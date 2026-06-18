"use client";

import { Camera, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  TaskDetailPane,
  TeamTaskDetail,
} from "@/components/teams/team-task-detail";
import { ResizableSplit } from "@/components/ui/resizable-split";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useReportCorpus } from "@/lib/filters/context";
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
  merged: "text-subtle bg-overlay-strong",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

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
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60",
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
            <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
              <p className="text-sm text-subtle">
                {tab === "todo"
                  ? "No open tasks. Nice — the queue is clear."
                  : tab === "done"
                    ? "No completed tasks yet."
                    : "No tasks for this team."}
              </p>
            </div>
          ) : (
            <ul key={tab} className="fade-up flex flex-col gap-2">
              {visible.map((report) => (
                <TaskRow
                  key={report.id}
                  report={report}
                  selected={report.id === selectedId}
                  onClick={() => setSelectedId(report.id)}
                />
              ))}
            </ul>
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
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={selected}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60",
          selected
            ? "border-[#0a84ff]/40 bg-[#0a84ff]/[0.08]"
            : "border-hairline bg-surface hover:bg-overlay",
          isDemo && "demo-glow",
        )}
      >
        {/* Thumbnail */}
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-hairline bg-surface">
          {/* biome-ignore lint/performance/noImgElement: tiny lazy thumbnail; next/image is overkill for a 48px list cell. */}
          <img
            src={report.photo_public_url || undefined}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {hasAfter && (
            <span className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-tl-md bg-[#30d158] text-black">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <span className="truncate">{meta.label}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                STATUS_TONE[report.status],
              )}
            >
              {STATUS_LABEL[report.status]}
            </span>
          </span>
          <span className="flex items-center justify-between gap-3 text-[12px] text-faint">
            <span className="truncate">{report.address}</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              {timeAgo(report.created_at)}
            </span>
          </span>
        </span>

        {/* Affordance hint */}
        {report.status !== "closed" && (
          <span className="hidden shrink-0 items-center text-faint sm:inline-flex">
            <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        )}
      </button>
    </li>
  );
}

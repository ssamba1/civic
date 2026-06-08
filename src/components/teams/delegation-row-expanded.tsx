"use client";

import { memo, useEffect, useState } from "react";
import {
  Loader2,
  ImageOff,
  Plus,
  Send,
  Repeat2,
  Activity,
  CheckCircle2,
  GitMerge,
  XCircle,
} from "lucide-react";

import { TEAMS, type TeamId } from "@/lib/teams";
import {
  CATEGORY_SLA_TARGETS,
  type DashboardReport,
} from "@/lib/dashboard-data";
import {
  buildTimeline,
  similarNearby,
  type OverrideEvent,
  type TimelineEvent,
} from "@/lib/delegation-history";
import { timeAgo, timeUntil } from "@/lib/utils/time-ago";
import type { TeamWorkload } from "@/lib/teams-data";
import { Stat, StatGrid } from "@/components/analytics/bento-primitives";
import type { ReasoningResponse } from "@/app/api/ai/reasoning/route";

/* ------------------------------------------------------------------
   Public types
   ------------------------------------------------------------------ */

export type ReasoningData = ReasoningResponse;

interface DelegationRowExpandedProps {
  report: DashboardReport;
  effectiveTeam: TeamId;
  defaultTeam: TeamId;
  history: OverrideEvent[];
  corpus: DashboardReport[];
  workloads: Map<TeamId, TeamWorkload>;
  reasoningCache: Map<string, ReasoningData>;
  setReasoningCache: (id: string, data: ReasoningData) => void;
}

/* ------------------------------------------------------------------
   Local helpers
   ------------------------------------------------------------------ */

function ColoredStat({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">
        {label}
      </p>
      <p
        className="text-[22px] font-semibold tracking-tight tabular-nums mt-1 leading-none"
        style={{ color: valueColor ?? "#ffffff" }}
      >
        {value}
      </p>
      {hint && <p className="text-[12px] text-zinc-500 mt-1.5">{hint}</p>}
    </div>
  );
}

function TeamChip({ teamId }: { teamId: TeamId }) {
  const meta = TEAMS[teamId];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: meta.color + "22", color: meta.color }}
    >
      {meta.shortLabel}
    </span>
  );
}

const EVENT_DOT_COLOR: Record<TimelineEvent["kind"], string> = {
  created: "#0a84ff",
  dispatched: "#5ac8fa",
  reassigned: "#ff9f0a",
  in_progress: "#5ac8fa",
  resolved: "#30d158",
  merged: "#a78bfa",
  rejected: "#ff453a",
};

function EventIcon({ kind }: { kind: TimelineEvent["kind"] }) {
  const cls = "h-3 w-3";
  switch (kind) {
    case "created":
      return <Plus className={cls} />;
    case "dispatched":
      return <Send className={cls} />;
    case "reassigned":
      return <Repeat2 className={cls} />;
    case "in_progress":
      return <Activity className={cls} />;
    case "resolved":
      return <CheckCircle2 className={cls} />;
    case "merged":
      return <GitMerge className={cls} />;
    case "rejected":
      return <XCircle className={cls} />;
  }
}

function formatEventTimestamp(ts: string): string {
  const now = Date.now();
  const t = Date.parse(ts);
  return t > now ? timeUntil(ts) : timeAgo(ts);
}

function renderEventBody(event: TimelineEvent) {
  switch (event.kind) {
    case "created":
      return (
        <span>
          <span className="font-medium text-white">Created</span>{" "}
          <span className="text-zinc-400">
            — Auto-routed to <TeamChip teamId={event.defaultTeam} />
          </span>
        </span>
      );
    case "dispatched":
      return (
        <span>
          <span className="font-medium text-white">Dispatched</span>{" "}
          <span className="text-zinc-400">
            to <TeamChip teamId={event.team} />
          </span>
        </span>
      );
    case "reassigned":
      return (
        <span>
          <span className="font-medium text-white">Reassigned</span>{" "}
          <span className="text-zinc-400 inline-flex items-center gap-1">
            <TeamChip teamId={event.from} />
            <span className="text-zinc-500">{"→"}</span>
            <TeamChip teamId={event.to} />
          </span>
        </span>
      );
    case "in_progress":
      return <span className="font-medium text-white">In progress</span>;
    case "resolved":
      return <span className="font-medium text-white">Resolved</span>;
    case "merged":
      return <span className="font-medium text-white">Merged</span>;
    case "rejected":
      return <span className="font-medium text-white">Rejected</span>;
  }
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */

function DelegationRowExpandedInner({
  report,
  effectiveTeam,
  defaultTeam: _defaultTeam,
  history,
  corpus,
  workloads,
  reasoningCache,
  setReasoningCache,
}: DelegationRowExpandedProps) {
  void _defaultTeam;

  // Demo report: skip the network fetch and render baked AI reasoning instantly.
  const demoReasoning =
    report.demo && report.ai_reasoning
      ? ({
          reportId: report.id,
          reasoning: report.ai_reasoning,
          costBreakdown: [],
          scoringExplanation: [],
        } satisfies ReasoningData)
      : null;

  const cached = demoReasoning ?? reasoningCache.get(report.id);
  const [data, setData] = useState<ReasoningData | null>(cached ?? null);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const res = await fetch("/api/ai/reasoning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: report.id }),
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ReasoningData;
        if (signal.aborted) return;
        setData(json);
        setReasoningCache(report.id, json);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  /* -------- Stat tile values -------- */

  const similar = similarNearby(report, corpus, 500);
  const teamQueue = workloads.get(effectiveTeam)?.openCount ?? 0;

  const ageHours =
    (Date.now() - Date.parse(report.created_at)) / 3_600_000;
  const target = CATEGORY_SLA_TARGETS[report.category];
  const pct = Math.round((ageHours / target) * 100);
  const slaColor =
    pct > 100 ? "#ff453a" : pct >= 60 ? "#ff9f0a" : "#30d158";

  const estCost = 12 + report.severity * 18;

  /* -------- History -------- */

  const events = buildTimeline(report, history);

  /* -------- Render -------- */

  const effectiveMeta = TEAMS[effectiveTeam];
  const dutyFirstSentence = effectiveMeta.duties.split(".")[0];

  return (
    <div className="px-4 pb-4 pt-3 bg-white/[0.015] border-t border-white/[0.04]">
      {/* Section A: photo + reasoning */}
      {/* Mobile: photo full-width then reasoning below. sm+: side-by-side */}
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        {report.photo_public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={report.photo_public_url}
            alt={report.address}
            loading="lazy"
            decoding="async"
            className="h-[180px] w-full rounded-lg object-cover border border-white/[0.06] sm:h-[120px] sm:w-[160px]"
          />
        ) : (
          <div className="h-[100px] w-full rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center sm:h-[120px] sm:w-[160px]">
            <ImageOff className="h-5 w-5 text-zinc-600" />
          </div>
        )}

        <div className="min-w-0 flex flex-col gap-1.5">
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          )}

          {!loading && error && (
            <p className="text-[12px] text-[#ff453a]">Reasoning unavailable.</p>
          )}

          {!loading && !error && data && (
            <p className="text-[12px] font-medium text-white">
              {data.reasoning}
            </p>
          )}

          <p className="text-[12px] text-zinc-400">
            Routed to{" "}
            <span className="text-white">{effectiveMeta.label}</span> —{" "}
            {dutyFirstSentence}.
          </p>

          {!loading && !error && data && data.scoringExplanation[0] && (
            <p className="text-[11px] text-zinc-500">
              {data.scoringExplanation[0].title}:{" "}
              <span className="text-zinc-400">
                {data.scoringExplanation[0].value}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Section B: stat tiles */}
      <div className="mt-4">
        <StatGrid>
          <Stat
            label="Similar nearby"
            value={String(similar)}
            hint="within 500m"
          />
          <Stat
            label="Team queue"
            value={String(teamQueue)}
            hint={effectiveMeta.shortLabel}
          />
          <ColoredStat
            label="SLA used"
            value={`${pct}%`}
            valueColor={slaColor}
            hint={`target ${target}h`}
          />
          <Stat
            label="Est. cost"
            value={`$${estCost}`}
            hint={`sev ${report.severity}/5`}
          />
        </StatGrid>
      </div>

      {/* Section C: history timeline */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
          History
        </p>
        <ol className="flex flex-col gap-2 pl-3 border-l border-white/[0.06]">
          {events.map((event, idx) => (
            <li
              key={`${event.kind}-${event.ts}-${idx}`}
              className="relative flex items-start gap-2 text-[12px]"
            >
              <span
                className="absolute -left-[7px] top-1.5 h-2 w-2 rounded-full"
                style={{ background: EVENT_DOT_COLOR[event.kind] }}
              />
              <span className="text-zinc-400 mt-0.5">
                <EventIcon kind={event.kind} />
              </span>
              <span className="text-zinc-300">{renderEventBody(event)}</span>
              <span className="ml-auto text-zinc-500 text-[11px]">
                {formatEventTimestamp(event.ts)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export const DelegationRowExpanded = memo(DelegationRowExpandedInner);
export default DelegationRowExpanded;

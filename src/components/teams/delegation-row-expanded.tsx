"use client";

import {
  Activity,
  CheckCircle2,
  GitMerge,
  ImageOff,
  Plus,
  Repeat2,
  Send,
  XCircle,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ReasoningResponse } from "@/app/api/ai/reasoning/route";
import { Stat, StatGrid } from "@/components/analytics/bento-primitives";
import { formatCost } from "@/lib/currency";
import { categorySlaHours, type DashboardReport } from "@/lib/dashboard-data";
import {
  buildTimeline,
  type OverrideEvent,
  similarNearby,
  type TimelineEvent,
} from "@/lib/delegation-history";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { TeamWorkload } from "@/lib/teams-data";
import { useCurrency } from "@/lib/use-currency";
import { timeAgo, timeUntil } from "@/lib/utils/time-ago";

/* ------------------------------------------------------------------
   Reasoning-fetch circuit breaker (module scope, per page load).

   /api/ai/reasoning returns 401 for unauthenticated visitors. The live
   Gemini path is staff-only. The delegation panel mounts one row per
   report (~30), each of which would otherwise fire a request, producing a
   burst of 401s. Two guards stop that:
     1. Rows only fetch once visible (expanded). See the IntersectionObserver
        below, so a page of collapsed rows fires nothing.
     2. The first 401 trips this flag; every other row then skips the network
        entirely and shows the unavailable state (stop-after-first-401).
   Reset on a full page load (module re-eval), e.g. after signing in.
   ------------------------------------------------------------------ */
let reasoningAuthBlocked = false;

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
      <p className="text-[11px] text-faint uppercase tracking-wider">{label}</p>
      <p
        className="text-[22px] font-semibold tracking-tight tabular-nums mt-1 leading-none"
        style={{ color: valueColor ?? "var(--foreground)" }}
      >
        {value}
      </p>
      {hint && <p className="text-[12px] text-faint mt-1.5">{hint}</p>}
    </div>
  );
}

function TeamChip({ teamId }: { teamId: TeamId }) {
  const meta = TEAMS[teamId];
  return (
    <span className="inline-flex items-center gap-1 rounded bg-overlay px-1.5 py-0.5 text-[10px] text-foreground">
      {meta.shortLabel}
    </span>
  );
}

// Event *kind* is a state/action encoding (created/dispatched/…), not a
// team/category identity, so it keeps hue, mirrors lib/status.ts's tone
// table with the old bright Apple hues swapped for the muted enterprise set.
const EVENT_DOT_COLOR: Record<TimelineEvent["kind"], string> = {
  created: "var(--color-primary)",
  dispatched: "#5b6b8c",
  reassigned: "var(--color-warning)",
  in_progress: "#5b6b8c",
  resolved: "var(--color-success)",
  merged: "var(--color-muted)",
  rejected: "var(--color-danger)",
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
          <span className="font-medium text-foreground">Created</span>
          <span className="text-subtle">
            , auto-routed to <TeamChip teamId={event.defaultTeam} />
          </span>
        </span>
      );
    case "dispatched":
      return (
        <span>
          <span className="font-medium text-foreground">Dispatched</span>{" "}
          <span className="text-subtle">
            to <TeamChip teamId={event.team} />
          </span>
        </span>
      );
    case "reassigned":
      return (
        <span>
          <span className="font-medium text-foreground">Reassigned</span>{" "}
          <span className="text-subtle inline-flex items-center gap-1">
            <TeamChip teamId={event.from} />
            <span className="text-faint">{"→"}</span>
            <TeamChip teamId={event.to} />
          </span>
        </span>
      );
    case "in_progress":
      return <span className="font-medium text-foreground">In progress</span>;
    case "resolved":
      return <span className="font-medium text-foreground">Resolved</span>;
    case "merged":
      return <span className="font-medium text-foreground">Merged</span>;
    case "rejected":
      return <span className="font-medium text-foreground">Rejected</span>;
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

  // Row root. The IntersectionObserver target. Collapsed rows live inside a
  // height:0 wrapper (the panel's GSAP collapse), so they never intersect and
  // never fetch. Only an expanded (visible) row triggers the reasoning call.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // No cache miss to resolve, or no observer support (SSR/old browsers):
    // fall back to the original eager behavior so nothing regresses.
    if (cached || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // Observe once per report row; `cached` only flips false→true when the
    // fetch below populates it, at which point observation is moot.
  }, [cached]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on report.id + visible; `cached` is derived from the ref-backed reasoningCache the fetch itself writes, so including it (or the stable setters) would re-run/loop the fetch on cache populate
  useEffect(() => {
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }
    // Wait until the row is actually on-screen (expanded) before requesting.
    if (!visible) return;
    // A prior request already came back 401 (unauthenticated): don't re-probe,
    // just surface the unavailable state and make no network call.
    if (reasoningAuthBlocked) {
      setLoading(false);
      setError(true);
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
          // Forward report fields: live DB reports aren't in the server-side
          // static corpus, so the route can't resolve them by id alone.
          body: JSON.stringify({
            report_id: report.id,
            report: {
              category: report.category,
              severity: report.severity,
              status: report.status,
              address: report.address,
              created_at: report.created_at,
            },
          }),
          signal,
        });
        // Unauthenticated: trip the breaker so no other row re-probes.
        if (res.status === 401) {
          reasoningAuthBlocked = true;
          throw new Error("HTTP 401");
        }
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
  }, [report.id, visible]);

  /* -------- Stat tile values -------- */

  const similar = similarNearby(report, corpus, 500);
  const teamQueue = workloads.get(effectiveTeam)?.openCount ?? 0;

  const ageHours = (Date.now() - Date.parse(report.created_at)) / 3_600_000;
  const target = categorySlaHours(report.category);
  const pct = Math.round((ageHours / target) * 100);
  const slaColor =
    pct > 100
      ? "var(--color-danger)"
      : pct >= 60
        ? "var(--color-warning)"
        : "var(--color-success)";

  const currency = useCurrency();
  const estCost = 12 + report.severity * 18;

  /* -------- History -------- */

  const events = buildTimeline(report, history);

  /* -------- Render -------- */

  const effectiveMeta = TEAMS[effectiveTeam];
  const dutyFirstSentence = effectiveMeta.duties.split(".")[0];

  return (
    <div
      ref={rootRef}
      className="px-4 pb-4 pt-3 bg-overlay border-t border-hairline"
    >
      {/* Section A: photo + reasoning */}
      {/* Mobile: photo full-width then reasoning below. sm+: side-by-side */}
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
        {report.photo_public_url ? (
          // biome-ignore lint/performance/noImgElement: dynamic external/user-uploaded photo URL with no known dimensions and no Next loader for arbitrary remote hosts. Next/image is impractical
          <img
            src={report.photo_public_url}
            alt={report.address}
            loading="lazy"
            decoding="async"
            className="h-[180px] w-full rounded-lg object-cover border border-hairline sm:h-[120px] sm:w-[160px]"
          />
        ) : (
          <div className="h-[100px] w-full rounded-lg border border-hairline bg-overlay flex items-center justify-center sm:h-[120px] sm:w-[160px]">
            <ImageOff className="h-5 w-5 text-faint" />
          </div>
        )}

        <div className="min-w-0 flex flex-col gap-1.5">
          {loading && (
            <div
              className="flex flex-col gap-1.5"
              role="status"
              aria-label="Loading reasoning"
            >
              <span className="skeleton h-3 w-full rounded" />
              <span className="skeleton h-3 w-4/5 rounded" />
            </div>
          )}

          {!loading && error && (
            <p className="text-[12px] text-[var(--status-danger-fg)]">
              Reasoning unavailable.
            </p>
          )}

          {!loading && !error && data && (
            <p className="text-[12px] font-medium text-foreground">
              {data.reasoning}
            </p>
          )}

          <p className="text-[12px] text-subtle">
            Routed to{" "}
            <span className="text-foreground">{effectiveMeta.label}</span>,{" "}
            {dutyFirstSentence}.
          </p>

          {!loading && !error && data?.scoringExplanation[0] && (
            <p className="text-[11px] text-faint">
              {data.scoringExplanation[0].title}:{" "}
              <span className="text-subtle">
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
            value={formatCost(estCost, currency)}
            hint={`sev ${report.severity}/5`}
          />
        </StatGrid>
      </div>

      {/* Section C: history timeline */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-faint mb-2">
          History
        </p>
        <ol className="flex flex-col gap-2 pl-3 border-l border-hairline">
          {events.map((event, idx) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: derived append-only timeline from buildTimeline that never reorders; TimelineEvent has no stable id, idx only disambiguates same kind+ts
              key={`${event.kind}-${event.ts}-${idx}`}
              className="relative flex items-start gap-2 text-[12px]"
            >
              <span
                className="absolute -left-[7px] top-1.5 h-2 w-2 rounded-full"
                style={{ background: EVENT_DOT_COLOR[event.kind] }}
              />
              <span className="text-subtle mt-0.5">
                <EventIcon kind={event.kind} />
              </span>
              <span className="text-subtle">{renderEventBody(event)}</span>
              <span className="ml-auto text-faint text-[11px]">
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

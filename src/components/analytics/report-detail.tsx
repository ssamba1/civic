"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Clock, MapPin, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  CATEGORY_META,
  CATEGORY_SLA_TARGETS,
} from "@/lib/dashboard-data";
import type { DashboardReport } from "@/lib/dashboard-data";
import type { ReportStatus } from "@/lib/types";
import type {
  ReasoningResponse,
  ReasoningSection,
} from "@/app/api/ai/reasoning/route";

/* ==================================================================
   Report detail pane — right-hand column of the reports explorer.

   Given a selected report (or null) it renders the photo, an info
   grid, and the AI reasoning (Cost + Scoring). The reasoning payload
   is fetched lazily from /api/ai/reasoning, cached per id so that
   re-selecting a report is instant, and guarded against a slow fetch
   resolving after the user has moved to a different report.

   Helpers (status maps, severity colors, the Stat style) mirror the
   sibling components but are re-implemented locally — the originals
   are module-private and not exported.
   ================================================================== */

// Mirrors recent-reports.tsx STATUS_LABEL.
const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

// Mirrors recent-reports.tsx STATUS_TONE — text color + /10 hue wash.
const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

// Mirrors analytics-bento.tsx SEVERITY_COLORS.
const SEVERITY_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "#5ac8fa",
  2: "#30d158",
  3: "#ff9f0a",
  4: "#ff6b3a",
  5: "#ff453a",
};

const SEVERITY_DESC: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Cosmetic",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Emergency",
};

// Mirrors recent-reports.tsx timeAgo.
function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function ageDays(iso: string): number {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  return Math.floor(diff / 86_400_000);
}

// CATEGORY_SLA_TARGETS is in hours; show as days. 36h reads as 1.5d.
function formatDays(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}d` : `${rounded.toFixed(1)}d`;
}

function absoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------
   Small Stat helper — mirrors the analytics bento label/value style.
   ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-[15px] font-medium tabular-nums text-white leading-tight">
        {value}
      </span>
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </div>
  );
}

function StatusPill({ status }: { status: ReportStatus }) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ReasoningColumn({
  heading,
  sections,
}: {
  heading: string;
  sections: ReasoningSection[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {heading}
      </h4>
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <div key={s.title} className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-600">
              {s.title}
            </span>
            <p className="text-[12px] leading-relaxed text-zinc-300">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Reasoning fetch — ported from reasoning-hover.tsx, adapted to a
   report-id effect. Per-id cache keeps re-selection instant; a
   `cancelled` flag guards against a slow fetch resolving after the
   selection has changed. Adds an error state the hover card lacks.
   ------------------------------------------------------------------ */

type ReasoningState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: ReasoningResponse };

function useReasoning(reportId: string | null): ReasoningState {
  const cache = useRef<Map<string, ReasoningResponse>>(new Map());
  const [state, setState] = useState<ReasoningState>({ phase: "loading" });

  useEffect(() => {
    if (!reportId) {
      setState({ phase: "loading" });
      return;
    }

    const cached = cache.current.get(reportId);
    if (cached) {
      setState({ phase: "ready", data: cached });
      return;
    }

    let cancelled = false;
    setState({ phase: "loading" });

    fetch("/api/ai/reasoning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: ReasoningResponse) => {
        cache.current.set(reportId, json);
        if (!cancelled) setState({ phase: "ready", data: json });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return state;
}

/* ==================================================================
   ReportDetail
   ================================================================== */

/** Report photo with a graceful fallback. Some sources (CSP-blocked hosts,
   dead links, missing uploads) won't load; rather than leave a 16:9 void we
   swap in a neutral placeholder. Keyed by report id at the call site so the
   error state resets on every selection. */
function ReportImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-white/[0.02] text-zinc-600">
        <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        <span className="text-[12px]">Image unavailable</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="aspect-[16/9] w-full object-cover"
    />
  );
}

export function ReportDetail({ report }: { report: DashboardReport | null }) {
  const reasoning = useReasoning(report?.id ?? null);

  if (!report) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-center">
        <p className="text-[14px] text-zinc-500">Select a report</p>
      </div>
    );
  }

  const meta = CATEGORY_META[report.category];
  const sevColor = SEVERITY_COLORS[report.severity];
  const slaTargetHours = CATEGORY_SLA_TARGETS[report.category];
  const age = ageDays(report.created_at);
  const { lat, lng } = report.location;

  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      {/* 1. Image with overlaid severity chip + status pill */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#1c1c1e]">
        <ReportImage
          key={report.id}
          src={report.photo_public_url}
          alt={`${meta.label} report at ${report.address}`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-[12px] font-medium text-white backdrop-blur-sm"
            style={{ boxShadow: `inset 0 0 0 1px ${sevColor}66` }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: sevColor }}
              aria-hidden
            />
            Sev {report.severity}
          </span>
          <StatusPill status={report.status} />
        </div>
      </div>

      {/* 2. Title row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-[20px] font-semibold tracking-tight text-white">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            <span className="truncate">{meta.label}</span>
          </h2>
          <StatusPill status={report.status} />
        </div>
        <p className="flex items-center gap-1.5 text-[13px] text-zinc-400">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
          <span className="truncate">{report.address}</span>
        </p>
      </div>

      {/* 3. Info grid */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Stat
          label="Severity"
          value={`Sev ${report.severity}`}
          hint={SEVERITY_DESC[report.severity]}
        />
        <Stat label="Status" value={STATUS_LABEL[report.status]} />
        <Stat label="Category" value={meta.label} />
        <Stat label="Reporter" value={report.reporter_id} />
        <Stat
          label="Reported"
          value={timeAgo(report.created_at)}
          hint={absoluteDate(report.created_at)}
        />
        <Stat label="Age" value={`${age}d`} />
        <Stat label="SLA target" value={formatDays(slaTargetHours / 24)} />
        <Stat
          label="Coordinates"
          value={`${lat.toFixed(4)}, ${lng.toFixed(4)}`}
        />
        <Stat label="Assigned team" value={report.assigned_team ?? "None"} />
      </div>

      {/* 4. AI reasoning */}
      <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-6">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-white">
            AI reasoning
          </h3>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            AI estimate
          </span>
        </div>

        {reasoning.phase === "loading" && (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}

        {reasoning.phase === "error" && (
          <p className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reasoning could not be loaded.
          </p>
        )}

        {reasoning.phase === "ready" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ReasoningColumn
              heading="Cost"
              sections={reasoning.data.costBreakdown}
            />
            <ReasoningColumn
              heading="Scoring"
              sections={reasoning.data.scoringExplanation}
            />
          </div>
        )}
      </div>
    </div>
  );
}

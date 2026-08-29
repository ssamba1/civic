"use client";

import { ImageOff, MapPin, Wrench } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { EvidenceFrame } from "@/app/city/[slug]/video/evidence-frame";
import { assignCrewToReport } from "@/app/staff/actions";
import {
  getReportEvidenceFrame,
  type ReportEvidence,
} from "@/app/staff/evidence-actions";
import { LiabilityBadge } from "@/components/liability/liability-badge";
import { teamIcon } from "@/components/teams/team-icon";
import { formatCost } from "@/lib/currency";
import { CATEGORY_META, CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type { GridCrewOption, GridReportRow } from "@/lib/dashboard-grid-data";
import { SEVERITY_HUE, severityHue } from "@/lib/severity-colors";
import { STATUS_LABEL, statusChipClass } from "@/lib/status";
import { categoryToTeam, TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { useCurrency } from "@/lib/use-currency";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

/* ==================================================================
   Work-order detail pane — right-hand column of the grid explorer.

   The grid sibling of analytics' ReportDetail. Both render a photo +
   overlaid chips, a title row, and a stat grid — but this one reads a
   GridReportRow (report + work-order join), so it surfaces the
   operational fields the grid is FOR (department, crew, priority,
   est cost/time, source, review flag) rather than the resident-facing
   fields (coordinates, reporter, AI reasoning) that ReportDetail shows
   and a grid row does not carry.

   Small helpers (titleize, severity ramp, status maps) are
   re-implemented locally rather than imported from work-order-grid —
   the grid's copies are module-private, matching the same convention
   report-detail.tsx follows against analytics-bento.
   ================================================================== */

const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const SEVERITY_DESC: Record<number, string> = {
  1: "Minor",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Critical",
};

function priorityHue(score: number): string {
  if (score < 4) return SEVERITY_HUE[1];
  if (score < 7) return SEVERITY_HUE[2];
  if (score < 9) return SEVERITY_HUE[3];
  if (score < 12) return SEVERITY_HUE[4];
  return SEVERITY_HUE[5];
}

function absoluteDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ageDays(iso: string): number {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  return Math.floor(diff / 86_400_000);
}

function formatDays(hours: number): string {
  const d = Math.round((hours / 24) * 10) / 10;
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-faint">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] font-medium tabular-nums text-foreground leading-tight underline-offset-2 hover:underline"
          title="Open in Google Maps"
        >
          {value}
        </a>
      ) : (
        <span className="text-[15px] font-medium tabular-nums text-foreground leading-tight">
          {value}
        </span>
      )}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const known = status as ReportStatus;
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium",
        statusChipClass(known),
      )}
    >
      {STATUS_LABEL[known] ?? titleize(status)}
    </span>
  );
}

/**
 * Mirrors VIDEO_PLACEHOLDER_PUBLIC_PATH in src/lib/video/decide.ts. Duplicated
 * rather than imported: decide.ts pulls the Gemini SDK and server env into
 * whatever imports it, and this is a client component.
 */
const VIDEO_PLACEHOLDER_PUBLIC_PATH = "/video-detection-placeholder.svg";

/**
 * Camera-detected reports carry that placeholder as their PUBLIC photo — the
 * real evidence is unblurred street footage that never leaves the private
 * bucket. Staff get the real thing: a staff-gated action mints a short-lived
 * signed URL for the whole captured frame and hands back the detector's own
 * bounding box, which is drawn back on top by the video console's EvidenceFrame
 * (same presentation, one place).
 *
 * The frame renders at its natural aspect, not the 16/9 crop the resident photo
 * uses — the box coordinates only line up against the uncropped frame.
 *
 * Anything that doesn't resolve (older rows, a cluster with no best detection,
 * a non-staff caller) falls back to `fallback`, i.e. the placeholder.
 */
function VideoEvidenceFrame({
  reportId,
  alt,
  fallback,
}: {
  reportId: string;
  alt: string;
  fallback: ReactNode;
}) {
  const [evidence, setEvidence] = useState<ReportEvidence | null>(null);

  useEffect(() => {
    let live = true;
    getReportEvidenceFrame(reportId).then((res) => {
      if (live && res.ok) setEvidence(res.data);
    });
    return () => {
      live = false;
    };
  }, [reportId]);

  if (!evidence) return <>{fallback}</>;

  return (
    <EvidenceFrame
      src={evidence.url}
      box={evidence.box}
      label={evidence.label}
      alt={alt}
      // EvidenceFrame's img is h-full/object-cover for its fixed-aspect callers;
      // here the wrapper has no height, so the child is released to its own.
      className="w-full [&>img]:h-auto [&>img]:object-contain"
    />
  );
}

/** Report photo with a graceful fallback — mirrors report-detail.tsx's
    ReportImage. Keyed by report id at the call site so a dead link on one
    selection doesn't poison the next. */
function WorkOrderImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (errored || !src) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-overlay text-faint">
        <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        <span className="text-[12px]">Image unavailable</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    // biome-ignore lint/performance/noImgElement: dynamic external/resident photo URL, next/image impractical
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="aspect-[16/9] w-full object-cover"
    />
  );
}

/**
 * Assigned-crew dropdown — the grid's deliberate assignment control. Own-
 * division crews list first (suggested = crew_type match), the rest follow
 * under an optgroup. Optimistic: the select flips immediately and rolls back
 * on a failed server write. Keyed by report id at the call site so state
 * never leaks across selections.
 */
function CrewAssignControl({
  reportId,
  teamId,
  crewType,
  assignedCrewId,
  crews,
}: {
  reportId: string;
  teamId: TeamId;
  crewType: string | null;
  assignedCrewId: string | null;
  crews: GridCrewOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(assignedCrewId ?? "");
  const [failed, setFailed] = useState(false);

  const own = crews.filter((c) => c.teamKey === teamId);
  const others = crews.filter((c) => c.teamKey !== teamId);
  // Suggested crews (matching AI labor type) sort to the top of the division.
  own.sort((a, b) => {
    const aSug = a.crewType !== null && a.crewType === crewType;
    const bSug = b.crewType !== null && b.crewType === crewType;
    if (aSug !== bSug) return aSug ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const optionLabel = (c: GridCrewOption) =>
    c.crewType !== null && c.crewType === crewType
      ? `${c.name} · suggested`
      : c.name;

  function handleChange(next: string) {
    const prev = value;
    setValue(next);
    setFailed(false);
    startTransition(async () => {
      const res = await assignCrewToReport(reportId, next === "" ? null : next);
      if (!res.ok) {
        setValue(prev);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Assigned crew"
        className="h-8 w-full max-w-[220px] rounded-[var(--radius-md)] border border-hairline bg-overlay px-2 text-[13px] text-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {own.map((c) => (
          <option key={c.id} value={c.id}>
            {optionLabel(c)}
          </option>
        ))}
        {others.length > 0 && (
          <optgroup label="Other divisions">
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {failed && (
        <span className="text-[11px] text-[var(--status-danger-fg)]">
          Couldn't save — try again.
        </span>
      )}
    </div>
  );
}

export function WorkOrderDetail({
  row,
  crews = [],
  canAssign = false,
}: {
  row: GridReportRow | null;
  crews?: GridCrewOption[];
  canAssign?: boolean;
}) {
  const currency = useCurrency();
  // Slug from the route (this pane only mounts under /city/[slug]/…) — used
  // to link the liability contractor name into the Contractors workspace.
  const params = useParams<{ slug?: string }>();
  const citySlug = typeof params?.slug === "string" ? params.slug : null;
  if (!row) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-center">
        <p className="text-[14px] text-faint">Select an issue</p>
      </div>
    );
  }

  const cat = (row.category ?? "other") as ReportCategory;
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const label = row.category ? meta.label : "Unclassified";
  const team = TEAMS[categoryToTeam(cat)];
  const TeamIcon = teamIcon(team.icon);
  const sla = row.category ? CATEGORY_SLA_TARGETS[cat] : undefined;
  const mapsHref = row.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        row.address,
      )}`
    : undefined;

  return (
    <div
      key={row.report_id}
      className="flex flex-col gap-5 sm:gap-7 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
    >
      {/* 1. Photo with overlaid severity + status */}
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
        {row.photo_public_url === VIDEO_PLACEHOLDER_PUBLIC_PATH ? (
          <VideoEvidenceFrame
            key={row.report_id}
            reportId={row.report_id}
            alt={`Camera evidence frame for ${label} at ${row.address ?? "unknown location"}`}
            fallback={
              <WorkOrderImage
                src={row.photo_public_url}
                alt={`${label} report at ${row.address ?? "unknown location"}`}
              />
            }
          />
        ) : (
          <WorkOrderImage
            key={row.report_id}
            src={row.photo_public_url ?? ""}
            alt={`${label} report at ${row.address ?? "unknown location"}`}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
          {row.severity != null ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-[12px] font-medium text-white backdrop-blur-sm"
              style={{
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${severityHue(
                  row.severity,
                )} 45%, transparent)`,
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: severityHue(row.severity),
                }}
                aria-hidden
              />
              Sev {row.severity}
            </span>
          ) : (
            <span aria-hidden />
          )}
          {row.is_emergency ? (
            <span className="inline-flex items-center rounded-md bg-[var(--color-danger)] px-2 py-0.5 text-[12px] font-bold text-white">
              EMERGENCY
            </span>
          ) : (
            <StatusPill status={row.status} />
          )}
        </div>
      </div>

      {/* 2. Title row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-[20px] font-semibold tracking-tight text-foreground">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block truncate">{label}</span>
              {row.subcategory && (
                <span className="block truncate text-[13px] font-normal text-subtle">
                  {row.subcategory}
                </span>
              )}
            </span>
          </h2>
          <StatusPill status={row.status} />
        </div>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-foreground"
            title="Open in Google Maps"
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
            <span className="truncate underline-offset-2 group-hover:underline">
              {row.address}
            </span>
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] text-faint">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
            No address on file
          </span>
        )}
      </div>

      {/* 3. Classification stat grid */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Stat
          label="Severity"
          value={row.severity != null ? `Sev ${row.severity}` : "—"}
          hint={row.severity != null ? SEVERITY_DESC[row.severity] : undefined}
        />
        {row.hazard_radius_m != null && row.hazard_radius_m > 0 && (
          <Stat
            label="Hazard zone"
            value={`~${Math.round(row.hazard_radius_m)}m`}
            hint="AI-estimated radius of the affected/unsafe area from the photo."
          />
        )}
        {/* Liability verdict — only when the engine has actually written a
            report_liability row. Absent data shows nothing at all rather than
            implying the city owns the cost. */}
        {row.liability && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-faint">
              Liability
            </span>
            <LiabilityBadge
              evaluation={row.liability}
              contractorName={row.liability.contractorName}
              contractorHref={
                citySlug && row.liability.liableContractorId
                  ? `/city/${citySlug}/contractors/${row.liability.liableContractorId}`
                  : null
              }
              contractRef={row.liability.contractRef}
              permitRef={row.liability.permitRef}
            />
          </div>
        )}
        <Stat
          label="Status"
          value={
            STATUS_LABEL[row.status as ReportStatus] ?? titleize(row.status)
          }
        />
        <Stat label="Category" value={label} />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-faint">
            Team
          </span>
          <span className="flex items-center gap-1.5 text-[15px] font-medium text-foreground leading-tight">
            <span
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
              style={{ color: team.color }}
            >
              <TeamIcon className="h-3 w-3" strokeWidth={2.25} />
            </span>
            {team.shortLabel}
          </span>
        </div>
        <Stat
          label="Reported"
          value={timeAgo(row.created_at)}
          hint={absoluteDate(row.created_at)}
        />
        <Stat label="Age" value={`${ageDays(row.created_at)}d`} />
        {sla != null && <Stat label="SLA target" value={formatDays(sla)} />}
        {row.address && (
          <Stat label="Location" value={row.address} href={mapsHref} />
        )}
        <Stat label="Report ID" value={row.report_id.slice(0, 8)} />
      </div>

      {/* 4. Work-order section — the operational payload the grid exists for.
          Null when the report has no work order yet (emergency / merged /
          not-yet-dispatched), so the "no WO" reality shows instead of blanks. */}
      <div className="flex flex-col gap-4 border-t border-hairline pt-6">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-subtle" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
            Work order
          </h3>
          {row.needs_manual_review && (
            <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--status-warning-fg)]">
              <span className="size-1.5 rounded-full bg-[var(--color-warning)]" />
              Review
            </span>
          )}
        </div>

        {row.work_order_id ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-faint">
                Priority
              </span>
              {row.priority_score != null ? (
                <span
                  className="text-[15px] font-semibold tabular-nums leading-tight"
                  style={{ color: priorityHue(row.priority_score) }}
                >
                  {row.priority_score.toFixed(1)}
                </span>
              ) : (
                <span className="text-[15px] font-medium text-faint leading-tight">
                  —
                </span>
              )}
            </div>
            <Stat
              label="Department"
              value={row.department ? titleize(row.department) : "—"}
            />
            <Stat
              label="Crew type"
              value={row.crew_type ? titleize(row.crew_type) : "—"}
            />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-faint">
                Assigned crew
              </span>
              {canAssign && crews.length > 0 ? (
                <CrewAssignControl
                  key={row.report_id}
                  reportId={row.report_id}
                  teamId={team.id}
                  crewType={row.crew_type}
                  assignedCrewId={row.assigned_crew_id}
                  crews={crews}
                />
              ) : (
                <span className="text-[15px] font-medium text-foreground leading-tight">
                  {row.assigned_crew_name ?? "—"}
                </span>
              )}
            </div>
            <Stat
              label="Est. cost"
              value={formatCost(row.est_cost, currency)}
            />
            <Stat
              label="Est. time"
              value={row.est_minutes != null ? `${row.est_minutes}m` : "—"}
            />
            <Stat
              label="Source"
              value={row.wo_source ? row.wo_source.toUpperCase() : "—"}
            />
          </div>
        ) : (
          <p className="text-[13px] text-faint">
            {row.is_emergency
              ? "Emergency — dispatched directly, no work order created."
              : "No work order yet for this report."}
          </p>
        )}
      </div>
    </div>
  );
}

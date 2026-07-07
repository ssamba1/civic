"use client";

import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { closeReportWorkOrder } from "@/app/staff/actions";
import { Button } from "@/components/ui/button";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { DEMO_MODE } from "@/lib/demo-mode";
import { STATUS_LABEL, statusChipClass } from "@/lib/status";
import { useTaskCompletion } from "@/lib/task-completion";
import { cn } from "@/lib/utils/cn";
import { downscaleImageToDataUrl } from "@/lib/utils/downscale-image";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { timeAgo } from "@/lib/utils/time-ago";

/** Neutral dot + category label + status pill — shared by every shell header. */
function DetailTitle({ report }: { report: DashboardReport }) {
  const meta = CATEGORY_META[report.category];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-faint"
        aria-hidden
      />
      <h2 className="truncate text-[15px] font-semibold text-foreground">
        {meta.label}
      </h2>
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          statusChipClass(report.status),
        )}
      >
        {STATUS_LABEL[report.status]}
      </span>
    </div>
  );
}

interface TeamTaskDetailProps {
  report: DashboardReport | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Mobile task detail — a portal sheet (right drawer on sm, bottom sheet on
 * phones) over a scrim. Used when the viewport is too narrow for the inline
 * split pane. Desktop uses {@link TaskDetailPane} instead.
 */
export function TeamTaskDetail({ report, open, onClose }: TeamTaskDetailProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open, onClose]);

  if (!mounted || !open || !report) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 animate-in fade-in"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${CATEGORY_META[report.category].label} task`}
        className={cn(
          "relative flex w-full flex-col overflow-y-auto border-hairline bg-surface text-foreground shadow-[0_8px_60px_rgba(0,0,0,0.6)] custom-scrollbar pb-safe",
          // Mobile: bottom sheet. sm+: right drawer.
          "mt-auto max-h-[88dvh] rounded-t-[var(--radius-lg)] border-t",
          "sm:mt-0 sm:ml-auto sm:h-full sm:max-h-none sm:w-[min(92vw,440px)] sm:rounded-none sm:rounded-l-[var(--radius-lg)] sm:border-l sm:border-t-0",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom sm:motion-safe:slide-in-from-right motion-safe:duration-300",
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-glass px-4 py-3 backdrop-blur-md">
          <DetailTitle report={report} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <TaskDetailBody key={report.id} report={report} />
      </div>
    </div>,
    document.body,
  );
}

interface TaskDetailPaneProps {
  report: DashboardReport;
  onClose: () => void;
}

/**
 * Desktop task detail — a sticky bordered card that lives in the right half of
 * the split pane and stays in view while the task list scrolls. Switching tasks
 * swaps the body in place (see the `key` on {@link TaskDetailBody}).
 */
export function TaskDetailPane({ report, onClose }: TaskDetailPaneProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-hairline bg-surface text-foreground shadow-[0_8px_40px_rgba(0,0,0,0.35)] custom-scrollbar motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-glass px-4 py-3 backdrop-blur-md">
        <DetailTitle report={report} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close detail"
          className="-mr-1"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <TaskDetailBody key={report.id} report={report} />
    </div>
  );
}

/**
 * The scrollable detail content + before/after completion flow. Shared by the
 * mobile sheet and the desktop pane. Remounted (via `key={report.id}`) on every
 * task switch so the in-progress capture state resets cleanly.
 */
function TaskDetailBody({ report }: { report: DashboardReport }) {
  const { markDone, reopen } = useTaskCompletion();
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [actualCost, setActualCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = report.status === "closed";
  const afterPhoto = report.afterPhoto ?? null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      setPendingPhoto(dataUrl);
    } catch {
      setError(
        "Couldn't process that image. Try another, or mark done without a photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkDone() {
    // Demo deploy: local-only completion overlay, no DB writes.
    if (DEMO_MODE) {
      markDone(report, pendingPhoto ?? undefined);
      setPendingPhoto(null);
      return;
    }

    // Live deploy: the close is a real work-order write. Actual cost is
    // required — it is the training signal for the cost model (issue-8).
    const cost = Number(actualCost);
    if (!actualCost.trim() || !Number.isFinite(cost) || cost <= 0) {
      setError("Enter the actual cost spent (a dollar amount above zero).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await closeReportWorkOrder(
        report.id,
        Math.round(cost * 100) / 100,
        pendingPhoto ?? undefined,
      );
      if (!result.ok) {
        setError(
          result.error === "work_order_not_found"
            ? "No work order exists for this report yet — dispatch it first."
            : result.error,
        );
        return;
      }
      // Mirror into the local overlay so the UI flips instantly; the DB row is
      // the durable record.
      markDone(report, pendingPhoto ?? undefined);
      setPendingPhoto(null);
      setActualCost("");
    } finally {
      setBusy(false);
    }
  }

  function handleReopen() {
    reopen(report);
    setPendingPhoto(null);
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* Meta */}
      <div className="flex flex-col gap-1.5 text-[13px] text-subtle">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 transition-colors hover:text-foreground"
          title="Open in Google Maps"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-foreground underline-offset-2 group-hover:underline">
            {report.address}
          </span>
        </a>
        <span className="inline-flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Reported {timeAgo(report.created_at)}
        </span>
        <span className="inline-flex items-center gap-2">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Severity {report.severity}/5
        </span>
        {report.completed_at && (
          <span className="inline-flex items-center gap-2 text-[var(--status-success-fg)]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            Completed {timeAgo(report.completed_at)}
          </span>
        )}
      </div>

      {report.ai_reasoning && (
        <p className="rounded-lg border border-hairline bg-overlay p-3 text-[13px] leading-relaxed text-subtle">
          {report.ai_reasoning}
        </p>
      )}

      {/* Before / After */}
      <div className="grid grid-cols-1 gap-3">
        <PhotoBlock label="Before" src={report.photo_public_url} />
        {(afterPhoto || pendingPhoto) && (
          <PhotoBlock
            label="After"
            src={(afterPhoto ?? pendingPhoto) as string}
            accent
            pending={!afterPhoto && !!pendingPhoto}
          />
        )}
      </div>

      {error && (
        <p className="text-[12px] text-[var(--status-danger-fg)]">{error}</p>
      )}

      {/* Actions */}
      {isDone ? (
        <Button variant="outline" size="lg" onClick={handleReopen}>
          <RotateCcw className="h-4 w-4" />
          Reopen task
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <label
            className={cn(
              "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed px-5 text-[14px] font-medium transition-colors",
              pendingPhoto
                ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--status-success-fg)] hover:bg-[var(--color-success)]/15"
                : "border-hairline-strong bg-overlay text-foreground hover:border-[color-mix(in_srgb,var(--color-primary)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]",
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {busy
              ? "Processing…"
              : pendingPhoto
                ? "Retake after photo"
                : "Add after photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
              disabled={busy}
            />
          </label>

          {!DEMO_MODE && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-subtle">
                Actual cost spent ($) <span aria-hidden="true">*</span>
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                placeholder="e.g. 240"
                aria-label="Actual cost spent in dollars"
                className="h-11 rounded-[var(--radius-md)] border border-hairline-strong bg-overlay px-3 text-[14px] text-foreground placeholder:text-faint focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
              />
            </label>
          )}

          <Button size="lg" onClick={handleMarkDone} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Mark done
          </Button>
          <p className="text-center text-[12px] text-faint">
            {DEMO_MODE
              ? "Photo optional — adds a before/after record."
              : "Photo optional — it's sent to the reporter with the resolution notice."}
          </p>
        </div>
      )}
    </div>
  );
}

function PhotoBlock({
  label,
  src,
  accent,
  pending,
}: {
  label: string;
  src: string;
  accent?: boolean;
  pending?: boolean;
}) {
  const isDataUrl = src.startsWith("data:");
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
          {label}
        </span>
        {pending && (
          <span className="text-[11px] font-medium text-[var(--status-success-fg)]">
            Not saved yet
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-lg border bg-surface",
          accent ? "border-[var(--color-success)]/30" : "border-hairline",
        )}
      >
        {/* Data URLs (after-photo) and remote seed photos differ; next/image
            handles remote, plain <img> handles the in-browser data URL. */}
        {isDataUrl ? (
          // biome-ignore lint/performance/noImgElement: in-browser data URL, not a remote asset next/image can optimize.
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : (
          <Image
            src={src}
            alt={label}
            fill
            className="object-cover"
            unoptimized
          />
        )}
      </div>
    </div>
  );
}

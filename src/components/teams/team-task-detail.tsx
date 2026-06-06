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

import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useTaskCompletion } from "@/lib/task-completion";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { downscaleImageToDataUrl } from "@/lib/utils/downscale-image";
import { timeAgo } from "@/lib/utils/time-ago";

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

/** Colored dot + category label + status pill — shared by every shell header. */
function DetailTitle({ report }: { report: DashboardReport }) {
  const meta = CATEGORY_META[report.category];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      <h2 className="truncate text-[15px] font-semibold text-white">
        {meta.label}
      </h2>
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          STATUS_TONE[report.status],
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open || !report) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[2px] animate-in fade-in"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${CATEGORY_META[report.category].label} task`}
        className={cn(
          "relative flex w-full flex-col overflow-y-auto border-white/[0.06] bg-[#101012] text-zinc-100 shadow-[0_8px_60px_rgba(0,0,0,0.6)] custom-scrollbar pb-safe",
          // Mobile: bottom sheet. sm+: right drawer.
          "mt-auto max-h-[88dvh] rounded-t-2xl border-t",
          "sm:mt-0 sm:ml-auto sm:h-full sm:max-h-none sm:w-[min(92vw,440px)] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom sm:motion-safe:slide-in-from-right motion-safe:duration-300",
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#101012]/90 px-4 py-3 backdrop-blur-md">
          <DetailTitle report={report} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
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
    <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#101012] text-zinc-100 shadow-[0_8px_40px_rgba(0,0,0,0.35)] custom-scrollbar motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#101012]/90 px-4 py-3 backdrop-blur-md">
        <DetailTitle report={report} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
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

  function handleMarkDone() {
    markDone(report, pendingPhoto ?? undefined);
    setPendingPhoto(null);
  }

  function handleReopen() {
    reopen(report);
    setPendingPhoto(null);
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* Meta */}
      <div className="flex flex-col gap-1.5 text-[13px] text-zinc-400">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 transition-colors hover:text-white"
          title="Open in Google Maps"
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-zinc-200 underline-offset-2 group-hover:underline">
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
          <span className="inline-flex items-center gap-2 text-[#30d158]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            Completed {timeAgo(report.completed_at)}
          </span>
        )}
      </div>

      {report.ai_reasoning && (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[13px] leading-relaxed text-zinc-300">
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

      {error && <p className="text-[12px] text-[#ff453a]">{error}</p>}

      {/* Actions */}
      {isDone ? (
        <button
          type="button"
          onClick={handleReopen}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-5 text-[14px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
        >
          <RotateCcw className="h-4 w-4" />
          Reopen task
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <label
            className={cn(
              "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed px-5 text-[14px] font-medium transition-colors",
              pendingPhoto
                ? "border-[#30d158]/40 bg-[#30d158]/10 text-[#30d158] hover:bg-[#30d158]/15"
                : "border-white/[0.14] bg-white/[0.03] text-zinc-200 hover:border-[#0a84ff]/50 hover:bg-[#0a84ff]/10",
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

          <button
            type="button"
            onClick={handleMarkDone}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#30d158] px-5 text-[14px] font-semibold text-black transition-colors hover:bg-[#28bb4c] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark done
          </button>
          <p className="text-center text-[12px] text-zinc-500">
            Photo optional — adds a before/after record.
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
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </span>
        {pending && (
          <span className="text-[11px] font-medium text-[#30d158]">
            Not saved yet
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-lg border bg-[#0a0a0b]",
          accent ? "border-[#30d158]/30" : "border-white/[0.06]",
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

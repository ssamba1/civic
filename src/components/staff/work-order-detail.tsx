"use client";

import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  Loader2,
  MapPin,
  Send,
  Upload,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import {
  closeWorkOrder,
  dispatchWorkOrder,
  overrideClassification,
  rejectReport,
} from "@/app/staff/actions";
import { DEMO_REPORTER_ID, isDemoId } from "@/lib/demo-reports";
import type {
  Classification,
  Report,
  ReportCategory,
  WorkOrder,
} from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { WorkOrderComments } from "./work-order-comments";

interface WorkOrderDetailProps {
  report: Report;
  classification: Classification;
  workOrder: WorkOrder;
  onClose: () => void;
  /** When false, renders only the panel content without the fixed overlay wrapper.
   *  Use this when embedding inside a Drawer (which provides its own overlay). */
  standalone?: boolean;
}

const SEVERITY_CONFIG: Record<
  number,
  { label: string; color: string; bg: string }
> = {
  1: {
    label: "Cosmetic",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-100 dark:bg-green-900/40",
  },
  2: {
    label: "Minor",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-100 dark:bg-yellow-900/40",
  },
  3: {
    label: "Moderate",
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/40",
  },
  4: {
    label: "Serious",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/40",
  },
  5: {
    label: "Critical",
    color: "text-red-900 dark:text-red-300",
    bg: "bg-red-200 dark:bg-red-900/60",
  },
};

const ALL_CATEGORIES: ReportCategory[] = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
];

export function WorkOrderDetail({
  report,
  classification,
  workOrder,
  onClose,
  standalone = true,
}: WorkOrderDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "dispatch" | "close" | "reject" | "override" | null
  >(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // Confidence bar fills from 0 on mount so the CSS transition fires visibly.
  const [barFilled, setBarFilled] = useState(false);

  const sevConfig =
    SEVERITY_CONFIG[classification.severity] ?? SEVERITY_CONFIG[3];
  const isDemo = report.reporter_id === DEMO_REPORTER_ID || isDemoId(report.id);

  // Auto-clear the success banner after 3s.
  useEffect(() => {
    if (!actionSuccess) return;
    const t = setTimeout(() => setActionSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  // Trigger the confidence-bar grow on mount (next frame so 0→target transitions).
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Clear the in-flight action marker once the transition settles.
  useEffect(() => {
    if (!isPending) setPendingAction(null);
  }, [isPending]);

  function handleDispatch() {
    setActionError(null);
    setPendingAction("dispatch");
    startTransition(async () => {
      const result = await dispatchWorkOrder(workOrder.id);
      if (result.ok) {
        setActionSuccess("Work order dispatched");
      } else {
        setActionError(result.error);
      }
    });
  }

  function handleClose() {
    setActionError(null);
    setPendingAction("close");
    startTransition(async () => {
      const result = await closeWorkOrder(workOrder.id);
      if (result.ok) {
        setActionSuccess("Work order closed");
      } else {
        setActionError(result.error);
      }
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) return;
    setActionError(null);
    setPendingAction("reject");
    startTransition(async () => {
      const result = await rejectReport(report.id, rejectReason);
      if (result.ok) {
        setActionSuccess("Report rejected");
        setShowRejectInput(false);
      } else {
        setActionError(result.error);
      }
    });
  }

  function handleOverride(newCategory: ReportCategory) {
    setActionError(null);
    setPendingAction("override");
    startTransition(async () => {
      const result = await overrideClassification(report.id, newCategory);
      if (result.ok) {
        setActionSuccess(`Category overridden to ${newCategory}`);
        setShowOverride(false);
      } else {
        setActionError(result.error);
      }
    });
  }

  // ── Inner content (shared between standalone and drawer modes) ──────────
  const panelContent = (
    <>
      {/* Header — only shown in standalone mode (drawer provides its own title bar) */}
      {standalone && (
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Work Order Detail
            </h2>
            <p className="text-sm text-zinc-500">
              {report.address ?? "Unknown location"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Photo — glows blue when this is the injected live demo point */}
        <div className={cn(isDemo && "p-4")}>
          <div
            className={cn(
              "relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800",
              isDemo && "demo-glow overflow-hidden rounded-xl",
            )}
          >
            {report.photo_public_url ? (
              <Image
                src={report.photo_public_url}
                alt="Report photo"
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400">
                No photo available
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Status messages */}
          {actionError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div className="flex animate-in fade-in slide-in-from-top-2 items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 duration-200 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {actionSuccess}
            </div>
          )}

          {/* Location */}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${report.location?.lat ?? 0},${report.location?.lng ?? 0}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3"
            title="Open in Google Maps"
          >
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400 group-hover:text-sky-500" />
            <div>
              <p className="text-sm font-medium text-zinc-900 underline-offset-2 group-hover:text-sky-600 group-hover:underline dark:text-zinc-100 dark:group-hover:text-sky-400">
                {report.address ?? "Unknown address"}
              </p>
              <p className="text-xs text-zinc-500">
                {report.location?.lat?.toFixed(6) ?? "—"},{" "}
                {report.location?.lng?.toFixed(6) ?? "—"}
              </p>
            </div>
          </a>

          {/* Classification details */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <Brain className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                AI Classification
              </h3>
              <span className="ml-auto text-xs text-zinc-500">
                {(classification.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <p className="text-xs text-zinc-500">Category</p>
                <p className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
                  {classification.category.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Subcategory</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {classification.subcategory}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Severity</p>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    sevConfig.bg,
                    sevConfig.color,
                  )}
                >
                  {classification.severity}/5 - {sevConfig.label}
                </span>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Hazard Radius</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {classification.hazard_radius_m}m
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-zinc-500">Size Estimate</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {classification.visible_size_estimate}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-zinc-500">Reasoning</p>
                <p className="text-sm italic text-zinc-600 dark:text-zinc-400">
                  "{classification.reasoning}"
                </p>
              </div>
            </div>

            {/* Confidence bar */}
            <div className="px-4 pb-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    classification.confidence >= 0.9
                      ? "bg-green-500"
                      : classification.confidence >= 0.7
                        ? "bg-yellow-500"
                        : "bg-red-500",
                  )}
                  style={{
                    width: barFilled
                      ? `${classification.confidence * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Work order details */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <Wrench className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Work Order
              </h3>
              {workOrder.wo_source && (
                <span
                  className={cn(
                    "ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    workOrder.wo_source === "ai"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  )}
                >
                  {workOrder.wo_source === "ai" ? "AI-generated" : "Rules"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <p className="text-xs text-zinc-500">Department</p>
                <p className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
                  {workOrder.department.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Crew Type</p>
                <p className="text-sm capitalize text-zinc-700 dark:text-zinc-300">
                  {workOrder.crew_type?.replace("_", " ") ?? "TBD"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Estimated Time</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {workOrder.est_minutes} min
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Priority Score</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {workOrder.priority_score.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Estimated Cost</p>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {typeof workOrder.est_cost === "number"
                      ? workOrder.est_cost.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-zinc-500">Materials</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(workOrder.materials?.length ?? 0) > 0 ? (
                    (workOrder.materials ?? []).map((m, i) => {
                      const o = m as {
                        item?: string;
                        name?: string;
                        qty?: number;
                      };
                      const label =
                        typeof m === "string"
                          ? m
                          : (o.item ?? o.name ?? JSON.stringify(m)) +
                            (o.qty && o.qty > 1 ? ` ×${o.qty}` : "");
                      return (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: derived read-only materials list, never reorders; no stable id on items
                          key={i}
                          className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-zinc-400">None listed</span>
                  )}
                </div>
              </div>
            </div>
            {/* AI cost/crew rationale — only when the AI generated the order */}
            {workOrder.wo_rationale && (
              <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <p className="text-xs text-zinc-500">AI Rationale</p>
                <p className="mt-0.5 text-sm italic text-zinc-600 dark:text-zinc-400">
                  "{workOrder.wo_rationale}"
                </p>
              </div>
            )}
          </div>

          {/* Override category */}
          {showOverride && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                Override AI Category
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ALL_CATEGORIES.filter(
                  (c) => c !== classification.category,
                ).map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => handleOverride(cat)}
                    disabled={isPending}
                    className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium capitalize text-zinc-700 transition-[transform,colors] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-blue-300 hover:bg-blue-50 active:scale-95 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-blue-600 md:min-h-0"
                  >
                    {cat.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reject reason input */}
          {showRejectInput && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">
                Rejection Reason
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this report being rejected?"
                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-red-700 dark:bg-zinc-800 dark:text-zinc-100 sm:text-sm"
                rows={3}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isPending || !rejectReason.trim()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 md:min-h-0"
                >
                  {pendingAction === "reject" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 md:min-h-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Staff comments (Realtime) */}
          <WorkOrderComments workOrderId={workOrder.id} />

          {/* Resolution photo upload placeholder */}
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Resolution Photo
            </p>
            {workOrder.resolution_photo_url ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <Image
                  src={workOrder.resolution_photo_url}
                  alt="Resolution photo"
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-6 transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-600 dark:hover:border-blue-600 dark:hover:bg-blue-900/10">
                <Upload className="h-8 w-8 text-zinc-400" />
                <span className="text-sm text-zinc-500">
                  Upload resolution photo to close
                </span>
                <input type="file" accept="image/*" className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="pb-safe flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-white px-4 py-3 md:px-6 md:py-4 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={handleDispatch}
          disabled={isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
        >
          {pendingAction === "dispatch" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Dispatch
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:flex-none"
        >
          {pendingAction === "close" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Close
        </button>
        <button
          type="button"
          onClick={() => setShowRejectInput(!showRejectInput)}
          disabled={isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 sm:flex-none"
        >
          <XCircle className="h-4 w-4" />
          Reject
        </button>
        <button
          type="button"
          onClick={() => setShowOverride(!showOverride)}
          disabled={isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:flex-none"
        >
          <Edit3 className="h-4 w-4" />
          Override
        </button>
      </div>
    </>
  );

  // ── Drawer mode: render content directly (Drawer provides the overlay) ──
  if (!standalone) {
    return (
      <div className="flex h-full flex-col overflow-hidden">{panelContent}</div>
    );
  }

  // ── Standalone mode: fixed overlay + slide-in panel ──────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: decorative click-to-dismiss backdrop; keyboard users close via the labeled Close button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: decorative click-to-dismiss backdrop; keyboard users close via the labeled Close button */}
      <div
        className="absolute inset-0 animate-in fade-in bg-black/30 backdrop-blur-sm duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-zinc-900">
        {panelContent}
      </div>
    </div>
  );
}

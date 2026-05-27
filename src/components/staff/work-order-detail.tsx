"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  X,
  Send,
  CheckCircle2,
  XCircle,
  Edit3,
  MapPin,
  Clock,
  Wrench,
  Brain,
  Upload,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
  Report,
  Classification,
  WorkOrder,
  ReportCategory,
} from "@/lib/types";
import {
  dispatchWorkOrder,
  closeWorkOrder,
  rejectReport,
  overrideClassification,
} from "@/app/staff/actions";

interface WorkOrderDetailProps {
  report: Report;
  classification: Classification;
  workOrder: WorkOrder;
  onClose: () => void;
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
}: WorkOrderDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const sevConfig = SEVERITY_CONFIG[classification.severity] ?? SEVERITY_CONFIG[3];

  function handleDispatch() {
    setActionError(null);
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

  function handleOverride(newCategory: string) {
    setActionError(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-900">
        {/* Header */}
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
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Photo */}
          <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800">
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

          <div className="space-y-6 p-6">
            {/* Status messages */}
            {actionError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {actionSuccess}
              </div>
            )}

            {/* Location */}
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {report.address ?? "Unknown address"}
                </p>
                <p className="text-xs text-zinc-500">
                  {report.location.lat.toFixed(6)},{" "}
                  {report.location.lng.toFixed(6)}
                </p>
              </div>
            </div>

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
                      sevConfig.color
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
                      "h-full rounded-full transition-all",
                      classification.confidence >= 0.9
                        ? "bg-green-500"
                        : classification.confidence >= 0.7
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{
                      width: `${classification.confidence * 100}%`,
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
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500">Materials</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {workOrder.materials.length > 0 ? (
                      workOrder.materials.map((m) => (
                        <span
                          key={m}
                          className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-zinc-400">None listed</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Override category */}
            {showOverride && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                  Override AI Category
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_CATEGORIES.filter(
                    (c) => c !== classification.category
                  ).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleOverride(cat)}
                      disabled={isPending}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium capitalize text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-blue-600"
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
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-red-700 dark:bg-zinc-800 dark:text-zinc-100"
                  rows={3}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleReject}
                    disabled={isPending || !rejectReason.trim()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => setShowRejectInput(false)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Staff notes */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Staff Notes
                </p>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add internal notes..."
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                rows={3}
              />
            </div>

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
        <div className="flex items-center gap-2 border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            onClick={handleDispatch}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Dispatch
          </button>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Close
          </button>
          <button
            onClick={() => setShowRejectInput(!showRejectInput)}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
          <button
            onClick={() => setShowOverride(!showOverride)}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Edit3 className="h-4 w-4" />
            Override
          </button>
        </div>
      </div>
    </div>
  );
}

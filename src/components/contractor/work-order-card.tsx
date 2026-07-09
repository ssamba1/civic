"use client";

import { useState } from "react";
import type { ContractorWorkOrder } from "@/app/contractor/actions";
import { updateWorkOrderProgress } from "@/app/contractor/actions";
import {
  CONTRACTOR_STATUS_LABEL,
  CONTRACTOR_STATUSES,
  type ContractorStatus,
  canTransition,
} from "@/lib/contractor/status";

interface Props {
  workOrder: ContractorWorkOrder;
  onUpdated: (updated: ContractorWorkOrder) => void;
}

/** Badge colour per contractor status */
function statusBadgeClass(status: ContractorStatus | null): string {
  switch (status) {
    case "assigned":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "accepted":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "in_progress":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
    case "complete":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "declined":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

export function WorkOrderCard({ workOrder, onUpdated }: Props) {
  const currentStatus: ContractorStatus =
    workOrder.contractor_status ?? "assigned";

  const [note, setNote] = useState(workOrder.contractor_note ?? "");
  const [photoUrl, setPhotoUrl] = useState(
    workOrder.contractor_photo_url ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const allowedTransitions = CONTRACTOR_STATUSES.filter((s) =>
    canTransition(currentStatus, s),
  );

  async function handleTransition(toStatus: ContractorStatus) {
    setError(null);
    setBusy(true);
    const result = await updateWorkOrderProgress(
      workOrder.id,
      toStatus,
      note.trim() || undefined,
      photoUrl.trim() || undefined,
    );
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onUpdated({
      ...workOrder,
      contractor_status: toStatus,
      contractor_note: note.trim() || null,
      contractor_photo_url: photoUrl.trim() || null,
      contractor_updated_at: new Date().toISOString(),
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {workOrder.report_address ?? "No address"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 capitalize">
            {workOrder.report_category?.replace(/_/g, " ") ?? "Unknown"}
            {" · "}
            {workOrder.department}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(currentStatus)}`}
        >
          {CONTRACTOR_STATUS_LABEL[currentStatus]}
        </span>
      </div>

      {/* Description (collapsible) */}
      {workOrder.report_description && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-left text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {expanded ? "▲ Hide details" : "▼ Show details"}
        </button>
      )}
      {expanded && workOrder.report_description && (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {workOrder.report_description}
        </p>
      )}

      {/* Progress note & photo */}
      {allowedTransitions.length > 0 && (
        <div className="mt-4 space-y-2">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Progress note (optional)"
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Photo URL (https://…, optional)"
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error.replace(/_/g, " ")}
        </p>
      )}

      {/* Action buttons */}
      {allowedTransitions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allowedTransitions.map((toStatus) => (
            <button
              key={toStatus}
              type="button"
              disabled={busy}
              onClick={() => handleTransition(toStatus)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                toStatus === "declined"
                  ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  : toStatus === "complete"
                    ? "bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                    : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
              }`}
            >
              {busy ? "…" : CONTRACTOR_STATUS_LABEL[toStatus]}
            </button>
          ))}
        </div>
      )}

      {/* Previous note (read-only if no actions left) */}
      {allowedTransitions.length === 0 && workOrder.contractor_note && (
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {workOrder.contractor_note}
        </p>
      )}
    </div>
  );
}

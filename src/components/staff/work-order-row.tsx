"use client";

import { useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Zap,
  Construction,
  Paintbrush,
  Trash2,
  Droplets,
  TreePine,
  Wind,
  Signpost,
  CircleDot,
  HelpCircle,
  Lamp,
  Clock,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
  Report,
  Classification,
  WorkOrder,
  ReportCategory,
  ReportStatus,
} from "@/lib/types";
import { WorkOrderDetail } from "./work-order-detail";

interface WorkOrderRowProps {
  report: Report;
  classification: Classification;
  workOrder: WorkOrder;
  isSelected: boolean;
  onSelect: () => void;
}

const CATEGORY_ICONS: Record<ReportCategory, typeof AlertTriangle> = {
  pothole: CircleDot,
  streetlight: Lamp,
  downed_sign: Signpost,
  graffiti: Paintbrush,
  illegal_dump: Trash2,
  water_leak: Droplets,
  sidewalk_damage: Construction,
  tree_down: TreePine,
  debris: Wind,
  drainage: Droplets,
  faded_signage: Signpost,
  other: HelpCircle,
};

const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  2: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  3: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  4: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  5: "bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-300",
};

const STATUS_STYLES: Record<ReportStatus, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  dispatched:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
  closed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  merged:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorkOrderRow({
  report,
  classification,
  workOrder,
  isSelected,
  onSelect,
}: WorkOrderRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const Icon = CATEGORY_ICONS[classification.category] ?? HelpCircle;
  const sevColor =
    SEVERITY_COLORS[classification.severity] ?? SEVERITY_COLORS[3];
  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.open;

  const materialsDisplay = (workOrder.materials ?? []).slice(0, 3).join(", ");
  const materialsOverflow = (workOrder.materials?.length ?? 0) > 3;

  return (
    <>
      <tr
        onClick={() => {
          onSelect();
          setDetailOpen(true);
        }}
        tabIndex={0}
        role="button"
        className={cn(
          "cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
          isSelected && "bg-blue-50/70 dark:bg-blue-900/10"
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
      >
        {/* Category */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
                {classification.category.replace("_", " ")}
              </p>
              <p className="text-xs text-zinc-500">
                {classification.subcategory}
              </p>
            </div>
          </div>
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              sevColor
            )}
          >
            {classification.severity}
          </span>
        </td>

        {/* Address */}
        <td className="px-4 py-3">
          <p className="max-w-[200px] truncate text-sm text-zinc-700 dark:text-zinc-300">
            {report.address ?? "Unknown"}
          </p>
        </td>

        {/* Time since submitted */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-sm text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo(report.created_at)}
          </div>
        </td>

        {/* Estimated time */}
        <td className="px-4 py-3">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {workOrder.est_minutes}m
          </span>
        </td>

        {/* Materials */}
        <td className="hidden px-4 py-3 xl:table-cell">
          <p className="max-w-[180px] truncate text-xs text-zinc-500">
            {materialsDisplay}
            {materialsOverflow && ` +${(workOrder.materials?.length ?? 0) - 3}`}
            {(workOrder.materials?.length ?? 0) === 0 && "---"}
          </p>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
              statusStyle
            )}
          >
            {report.status.replace("_", " ")}
          </span>
        </td>

        {/* Photo thumbnail */}
        <td className="hidden px-4 py-3 lg:table-cell">
          {report.photo_public_url ? (
            <div className="relative h-10 w-14 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
              <Image
                src={report.photo_public_url}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
          ) : (
            <div className="h-10 w-14 rounded-md bg-zinc-100 dark:bg-zinc-800" />
          )}
        </td>

        {/* Arrow */}
        <td className="px-2 py-3">
          <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
        </td>
      </tr>

      {/* Detail panel */}
      {detailOpen && (
        <WorkOrderDetail
          report={report}
          classification={classification}
          workOrder={workOrder}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

// Allow parent to control detail open state via keyboard
export function WorkOrderRowControlled({
  report,
  classification,
  workOrder,
  isSelected,
  onSelect,
  detailOpen,
  onDetailOpen,
  onDetailClose,
}: WorkOrderRowProps & {
  detailOpen: boolean;
  onDetailOpen: () => void;
  onDetailClose: () => void;
}) {
  const Icon = CATEGORY_ICONS[classification.category] ?? HelpCircle;
  const sevColor =
    SEVERITY_COLORS[classification.severity] ?? SEVERITY_COLORS[3];
  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.open;

  const materialsDisplay = (workOrder.materials ?? []).slice(0, 3).join(", ");
  const materialsOverflow = (workOrder.materials?.length ?? 0) > 3;

  return (
    <>
      <tr
        onClick={() => {
          onSelect();
          onDetailOpen();
        }}
        tabIndex={0}
        role="button"
        className={cn(
          "cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
          isSelected && "bg-blue-50/70 dark:bg-blue-900/10"
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onDetailOpen();
          }
        }}
      >
        {/* Category */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
                {classification.category.replace("_", " ")}
              </p>
              <p className="text-xs text-zinc-500">
                {classification.subcategory}
              </p>
            </div>
          </div>
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              sevColor
            )}
          >
            {classification.severity}
          </span>
        </td>

        {/* Address */}
        <td className="px-4 py-3">
          <p className="max-w-[200px] truncate text-sm text-zinc-700 dark:text-zinc-300">
            {report.address ?? "Unknown"}
          </p>
        </td>

        {/* Time */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-sm text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            {timeAgo(report.created_at)}
          </div>
        </td>

        {/* Est minutes */}
        <td className="px-4 py-3">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {workOrder.est_minutes}m
          </span>
        </td>

        {/* Materials */}
        <td className="hidden px-4 py-3 xl:table-cell">
          <p className="max-w-[180px] truncate text-xs text-zinc-500">
            {materialsDisplay}
            {materialsOverflow && ` +${(workOrder.materials?.length ?? 0) - 3}`}
            {(workOrder.materials?.length ?? 0) === 0 && "---"}
          </p>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
              statusStyle
            )}
          >
            {report.status.replace("_", " ")}
          </span>
        </td>

        {/* Photo */}
        <td className="hidden px-4 py-3 lg:table-cell">
          {report.photo_public_url ? (
            <div className="relative h-10 w-14 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
              <Image
                src={report.photo_public_url}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
          ) : (
            <div className="h-10 w-14 rounded-md bg-zinc-100 dark:bg-zinc-800" />
          )}
        </td>

        {/* Arrow */}
        <td className="px-2 py-3">
          <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
        </td>
      </tr>

      {detailOpen && (
        <WorkOrderDetail
          report={report}
          classification={classification}
          workOrder={workOrder}
          onClose={onDetailClose}
        />
      )}
    </>
  );
}

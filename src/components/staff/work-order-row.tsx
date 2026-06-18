"use client";

import {
  type AlertTriangle,
  ChevronRight,
  CircleDot,
  Clock,
  Construction,
  Droplets,
  Eye,
  HelpCircle,
  Lamp,
  Paintbrush,
  Signpost,
  Trash2,
  TreePine,
  Wind,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { DEMO_REPORTER_ID, isDemoId } from "@/lib/demo-reports";
import type { TeamDisplay } from "@/lib/onboarding/types";
import type {
  Classification,
  Report,
  ReportCategory,
  ReportStatus,
  WorkOrder,
} from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { WorkOrderDetail } from "./work-order-detail";

/**
 * Materials come in two shapes: plain strings (rule table / classify pipeline)
 * and objects (`{ item, qty }`) from the seed. Normalize both to a label.
 */
function formatMaterials(materials: unknown): string[] {
  if (!Array.isArray(materials)) return [];
  return materials.map((m) => {
    if (typeof m === "string") return m;
    if (m && typeof m === "object") {
      const o = m as { item?: string; name?: string; qty?: number };
      const label = o.item ?? o.name ?? JSON.stringify(m);
      return o.qty && o.qty > 1 ? `${label} ×${o.qty}` : label;
    }
    return String(m);
  });
}

interface WorkOrderRowProps {
  report: Report;
  classification: Classification;
  workOrder: WorkOrder;
  isSelected: boolean;
  onSelect: () => void;
  /** Owning team for this report's category, resolved from the city's config. */
  team?: TeamDisplay;
}

/** Small team-ownership chip rendered in the inbox (dot + label). */
function TeamChip({ team }: { team: TeamDisplay }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: team.color }}
        aria-hidden="true"
      />
      {team.label}
    </span>
  );
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
  merged: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
};

function NeedsReviewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
        className,
      )}
      title="AI flagged this report for manual review"
    >
      <Eye className="h-3 w-3" />
      Needs Review
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Render-safe wrapper for {@link timeAgo}. Seeds with the synchronous value so
 * there is no blank flash, then recomputes on the client every minute. Pair the
 * rendered node with `suppressHydrationWarning`: the server timestamp and the
 * hydrating client timestamp can straddle a minute boundary and produce
 * different labels, which would otherwise log a hydration mismatch.
 */
function useTimeAgo(dateStr: string): string {
  const [label, setLabel] = useState(() => timeAgo(dateStr));
  useEffect(() => {
    setLabel(timeAgo(dateStr));
    const id = setInterval(() => setLabel(timeAgo(dateStr)), 60_000);
    return () => clearInterval(id);
  }, [dateStr]);
  return label;
}

export function WorkOrderRow({
  report,
  classification,
  workOrder,
  isSelected,
  onSelect,
  team,
}: WorkOrderRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const timeLabel = useTimeAgo(report.created_at);

  const Icon = CATEGORY_ICONS[classification.category] ?? HelpCircle;
  const sevColor =
    SEVERITY_COLORS[classification.severity] ?? SEVERITY_COLORS[3];
  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.open;

  const materialsList = formatMaterials(workOrder.materials);
  const materialsDisplay = materialsList.slice(0, 3).join(", ");
  const materialsOverflow = materialsList.length > 3;

  const isDemo =
    report.reporter_id === DEMO_REPORTER_ID || isDemoId(workOrder.id);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a clickable table row can't be a native <button> (invalid inside <table>); role="button" + tabIndex + onKeyDown give it full keyboard support */}
      <tr
        onClick={() => {
          onSelect();
          setDetailOpen(true);
        }}
        tabIndex={0}
        role="button"
        className={cn(
          "cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
          isSelected && "bg-blue-50/70 dark:bg-blue-900/10",
          isDemo && "demo-glow",
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
              {team && <TeamChip team={team} />}
            </div>
          </div>
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              sevColor,
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
            <span suppressHydrationWarning>{timeLabel}</span>
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
            {materialsOverflow && ` +${materialsList.length - 3}`}
            {materialsList.length === 0 && "---"}
          </p>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                statusStyle,
              )}
            >
              {report.status.replace("_", " ")}
            </span>
            {workOrder.needs_manual_review && <NeedsReviewBadge />}
          </div>
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

// ── Mobile card (used below md breakpoint) ──────────────────────────────────
export interface WorkOrderCardProps {
  report: Report;
  classification: Classification;
  workOrder: WorkOrder;
  isSelected: boolean;
  onSelect: () => void;
  onDetailOpen: () => void;
  /** Owning team for this report's category, resolved from the city's config. */
  team?: TeamDisplay;
}

export function WorkOrderCard({
  report,
  classification,
  workOrder,
  isSelected,
  onSelect,
  onDetailOpen,
  team,
  isNew = false,
}: WorkOrderCardProps & { isNew?: boolean }) {
  const timeLabel = useTimeAgo(report.created_at);
  const Icon = CATEGORY_ICONS[classification.category] ?? HelpCircle;
  const sevColor =
    SEVERITY_COLORS[classification.severity] ?? SEVERITY_COLORS[3];
  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.open;

  const isDemo =
    report.reporter_id === DEMO_REPORTER_ID || isDemoId(workOrder.id);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        onDetailOpen();
      }}
      className={cn(
        "w-full text-left flex items-start gap-3 rounded-[10px] border px-4 py-3 transition-colors active:scale-[0.99]",
        isNew && "animate-in fade-in slide-in-from-top-2 duration-300",
        "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
        isSelected
          ? "border-blue-300 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-900/20"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
        isDemo && "demo-glow",
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-zinc-100 dark:bg-zinc-800">
        {report.photo_public_url ? (
          <Image
            src={report.photo_public_url}
            alt=""
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="h-5 w-5 text-zinc-400" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Row 1: category + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-100">
            {classification.category.replace(/_/g, " ")}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              sevColor,
            )}
          >
            S{classification.severity}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              statusStyle,
            )}
          >
            {report.status.replace(/_/g, " ")}
          </span>
          {workOrder.needs_manual_review && <NeedsReviewBadge />}
          {team && <TeamChip team={team} />}
        </div>

        {/* Row 2: address */}
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {report.address ?? "Unknown location"}
        </p>

        {/* Row 3: meta */}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-0.5" suppressHydrationWarning>
            <Clock className="h-3 w-3" />
            {timeLabel}
          </span>
          <span>{workOrder.est_minutes}m est.</span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
    </button>
  );
}

// Allow parent to control detail open state via keyboard
export function WorkOrderRowControlled({
  report,
  classification,
  workOrder,
  isSelected,
  onSelect,
  team,
  detailOpen,
  onDetailOpen,
  onDetailClose,
  isNew = false,
}: WorkOrderRowProps & {
  detailOpen: boolean;
  onDetailOpen: () => void;
  onDetailClose: () => void;
  isNew?: boolean;
}) {
  const timeLabel = useTimeAgo(report.created_at);
  const Icon = CATEGORY_ICONS[classification.category] ?? HelpCircle;
  const sevColor =
    SEVERITY_COLORS[classification.severity] ?? SEVERITY_COLORS[3];
  const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.open;

  const materialsList = formatMaterials(workOrder.materials);
  const materialsDisplay = materialsList.slice(0, 3).join(", ");
  const materialsOverflow = materialsList.length > 3;

  const isDemo =
    report.reporter_id === DEMO_REPORTER_ID || isDemoId(workOrder.id);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a clickable table row can't be a native <button> (invalid inside <table>); role="button" + tabIndex + onKeyDown give it full keyboard support */}
      <tr
        onClick={() => {
          onSelect();
          onDetailOpen();
        }}
        tabIndex={0}
        role="button"
        className={cn(
          "cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
          isNew && "animate-in fade-in slide-in-from-top-2 duration-300",
          isSelected && "bg-blue-50/70 dark:bg-blue-900/10",
          isDemo && "demo-glow",
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
              {team && <TeamChip team={team} />}
            </div>
          </div>
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              sevColor,
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
            <span suppressHydrationWarning>{timeLabel}</span>
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
            {materialsOverflow && ` +${materialsList.length - 3}`}
            {materialsList.length === 0 && "---"}
          </p>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                statusStyle,
              )}
            >
              {report.status.replace("_", " ")}
            </span>
            {workOrder.needs_manual_review && <NeedsReviewBadge />}
          </div>
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

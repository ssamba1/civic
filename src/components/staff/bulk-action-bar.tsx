"use client";

import { useState, useTransition } from "react";
import { bulkUpdateReports } from "@/app/staff/bulk-actions";
import { useToast } from "@/components/ui/toast";
import { BULK_ACTIONS, type BulkAction } from "@/lib/staff/bulk";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Value pickers per action
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
  { value: "rejected", label: "Rejected" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const ACTION_LABELS: Record<BulkAction, string> = {
  acknowledge: "Acknowledge",
  assign_team: "Assign Team",
  set_status: "Set Status",
  set_priority: "Set Priority",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BulkActionBarProps {
  selectedIds: string[];
  /** Called after a successful bulk operation — e.g. to clear selection + refresh list */
  onDone?: (updated: number, skipped: number) => void;
  /** Optional CSS class for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionBar({
  selectedIds,
  onDone,
  className,
}: BulkActionBarProps) {
  const [action, setAction] = useState<BulkAction>("acknowledge");
  const [value, setValue] = useState<string>("");
  const [teamInput, setTeamInput] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const count = selectedIds.length;

  if (count === 0) return null;

  // Reset value picker when action changes
  function handleActionChange(next: BulkAction) {
    setAction(next);
    setValue("");
    setTeamInput("");
  }

  function resolvedValue(): string | null {
    switch (action) {
      case "acknowledge":
        return null;
      case "assign_team":
        return teamInput.trim() || null;
      case "set_status":
      case "set_priority":
        return value || null;
    }
  }

  function handleApply() {
    const val = resolvedValue();

    // Basic client-side guard
    if (action === "assign_team" && !val) {
      toast("Please enter a team name or ID", "error");
      return;
    }
    if ((action === "set_status" || action === "set_priority") && !val) {
      toast("Please select a value", "error");
      return;
    }

    startTransition(async () => {
      try {
        const result = await bulkUpdateReports(selectedIds, action, val);
        if (!result.ok) {
          toast(`Operation failed: ${result.error}`, "error");
          return;
        }
        const { updated, skipped } = result.data;
        const msg =
          skipped > 0
            ? `Updated ${updated} report${updated !== 1 ? "s" : ""} (${skipped} skipped — not in your city)`
            : `Updated ${updated} report${updated !== 1 ? "s" : ""}`;
        toast(msg, "success");
        onDone?.(updated, skipped);
      } catch {
        toast("Unexpected error — please try again", "error");
      }
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm shadow-sm",
        className,
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      {/* Selection count badge */}
      <span className="font-semibold text-blue-700">{count} selected</span>

      <div className="h-4 w-px bg-blue-200" aria-hidden />

      {/* Action picker */}
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Action:</span>
        <select
          className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={action}
          onChange={(e) => handleActionChange(e.target.value as BulkAction)}
          disabled={isPending}
        >
          {BULK_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </label>

      {/* Value picker — only shown for actions that need a value */}
      {action === "set_status" && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          <select
            className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
          >
            <option value="">— pick —</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {action === "set_priority" && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Priority:</span>
          <select
            className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
          >
            <option value="">— pick —</option>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {action === "assign_team" && (
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Team:</span>
          <input
            type="text"
            placeholder="team-id or name"
            className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={teamInput}
            onChange={(e) => setTeamInput(e.target.value)}
            disabled={isPending}
          />
        </label>
      )}

      {/* Apply button */}
      <button
        type="button"
        onClick={handleApply}
        disabled={isPending || count === 0}
        className={cn(
          "ml-auto rounded-md px-3 py-1 font-medium text-white transition-colors",
          "bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
        )}
      >
        {isPending ? "Applying…" : "Apply"}
      </button>
    </div>
  );
}

// Re-export the hook so consumers can import from one place
export { useBulkSelection } from "@/lib/hooks/use-bulk-selection";

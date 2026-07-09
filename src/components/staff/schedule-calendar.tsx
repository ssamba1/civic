"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  type ScheduledWorkOrderRow,
  scheduleWorkOrder,
  unscheduleWorkOrder,
} from "@/app/staff/schedule-actions";
import {
  detectConflicts,
  groupByDay,
  type ScheduleConflict,
  validateSchedule,
} from "@/lib/staff/schedule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Crew {
  id: string;
  name: string;
}

interface ScheduleCalendarProps {
  /** ISO date strings YYYY-MM-DD that define the visible week (7 days). */
  weekDates: string[];
  workOrders: ScheduledWorkOrderRow[];
  crews: Crew[];
  /** The city slug — used for revalidation hints, not routing. */
  cityId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  // "Mon Jul 14" style — pure JS, no locale dep on the server date format.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// ConflictBanner
// ---------------------------------------------------------------------------

function ConflictBanner({ conflicts }: { conflicts: ScheduleConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-4 py-3">
      <p className="text-[13px] font-medium text-warning-foreground">
        {conflicts.length} crew double-booking
        {conflicts.length > 1 ? "s" : ""} detected
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {conflicts.map((c) => (
          <li
            key={`${c.crewId}|${c.date}`}
            className="text-[12px] text-warning-foreground/80"
          >
            {formatDate(c.date)} — crew {c.crewId.slice(0, 8)}… (
            {c.workOrderIds.length} orders)
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleModal — inline form to set/clear a schedule
// ---------------------------------------------------------------------------

interface ScheduleModalProps {
  workOrder: ScheduledWorkOrderRow;
  crews: Crew[];
  onClose: () => void;
  onSaved: (updated: ScheduledWorkOrderRow) => void;
}

function ScheduleModal({
  workOrder,
  crews,
  onClose,
  onSaved,
}: ScheduleModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from existing schedule if any.
  const [scheduledFor, setScheduledFor] = useState(
    workOrder.scheduledFor
      ? workOrder.scheduledFor.slice(0, 16) // datetime-local format YYYY-MM-DDTHH:mm
      : "",
  );
  const [windowEnd, setWindowEnd] = useState(
    workOrder.scheduledWindowEnd
      ? workOrder.scheduledWindowEnd.slice(0, 16)
      : "",
  );
  const [crewId, setCrewId] = useState(workOrder.assignedCrewId ?? "");

  const handleSave = () => {
    setError(null);
    if (!scheduledFor) {
      setError("Please choose a date and time.");
      return;
    }
    const sf = new Date(`${scheduledFor}:00.000Z`);
    const we = windowEnd ? new Date(`${windowEnd}:00.000Z`) : undefined;

    const v = validateSchedule({ scheduledFor: sf, windowEnd: we });
    if (!v.ok) {
      const msgs: Record<string, string> = {
        past_date: "Scheduled date is in the past.",
        window_before_start: "Window end must be after start.",
        too_far_out: "Cannot schedule more than 90 days out.",
      };
      setError(msgs[v.error] ?? v.error);
      return;
    }

    startTransition(async () => {
      const result = await scheduleWorkOrder(
        workOrder.id,
        sf.toISOString(),
        we?.toISOString(),
        crewId || undefined,
      );
      if (!result.ok) {
        setError(result.error ?? "Save failed.");
        return;
      }
      onSaved({
        ...workOrder,
        scheduledFor: sf.toISOString(),
        scheduledWindowEnd: we?.toISOString() ?? null,
        assignedCrewId: crewId || null,
        crewName:
          crews.find((c) => c.id === crewId)?.name ??
          workOrder.crewName ??
          null,
      });
      onClose();
    });
  };

  const handleUnschedule = () => {
    setError(null);
    startTransition(async () => {
      const result = await unscheduleWorkOrder(workOrder.id);
      if (!result.ok) {
        setError(result.error ?? "Failed to unschedule.");
        return;
      }
      onSaved({ ...workOrder, scheduledFor: "", scheduledWindowEnd: null });
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sched-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 shadow-[var(--shadow-popover)]">
        <h2
          id="sched-modal-title"
          className="mb-4 text-[15px] font-semibold text-foreground"
        >
          Schedule work order
        </h2>
        <p className="mb-4 text-[13px] text-faint truncate">
          {workOrder.reportAddress ?? workOrder.id}
        </p>

        <label className="block mb-3">
          <span className="text-[12px] font-medium text-faint uppercase tracking-wide">
            Scheduled for *
          </span>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-hairline bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>

        <label className="block mb-3">
          <span className="text-[12px] font-medium text-faint uppercase tracking-wide">
            Window end (optional)
          </span>
          <input
            type="datetime-local"
            value={windowEnd}
            onChange={(e) => setWindowEnd(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-hairline bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>

        {crews.length > 0 && (
          <label className="block mb-4">
            <span className="text-[12px] font-medium text-faint uppercase tracking-wide">
              Assign crew (optional)
            </span>
            <select
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-hairline bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">— no crew —</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="mb-3 text-[13px] text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {workOrder.scheduledFor && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleUnschedule}
              className="rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Unschedule
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className="rounded-[var(--radius-sm)] bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkOrderCard
// ---------------------------------------------------------------------------

interface WOCardProps {
  wo: ScheduledWorkOrderRow;
  conflictIds: Set<string>;
  onEdit: (wo: ScheduledWorkOrderRow) => void;
}

function WorkOrderCard({ wo, conflictIds, onEdit }: WOCardProps) {
  const hasConflict = conflictIds.has(wo.id);
  return (
    <button
      type="button"
      onClick={() => onEdit(wo)}
      className={[
        "w-full text-left rounded-[var(--radius-sm)] border px-2.5 py-2 text-[12px] hover:shadow-sm transition-shadow",
        hasConflict
          ? "border-warning/60 bg-warning/10 text-warning-foreground"
          : "border-hairline bg-surface text-foreground",
      ].join(" ")}
    >
      <p className="font-medium truncate leading-tight">
        {wo.reportAddress ?? "Work order"}
      </p>
      {wo.category && (
        <p className="mt-0.5 text-[11px] text-faint capitalize">
          {wo.category.replace(/_/g, " ")}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-faint">
        {formatTime(wo.scheduledFor)}
        {wo.scheduledWindowEnd && ` – ${formatTime(wo.scheduledWindowEnd)}`}
      </p>
      {wo.crewName && (
        <p className="mt-0.5 text-[11px] text-faint truncate">
          🔧 {wo.crewName}
        </p>
      )}
      {hasConflict && (
        <p className="mt-1 text-[11px] font-semibold text-warning">
          Crew conflict
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScheduleCalendar (main export)
// ---------------------------------------------------------------------------

export function ScheduleCalendar({
  weekDates,
  workOrders: initialWorkOrders,
  crews,
}: ScheduleCalendarProps) {
  const [workOrders, setWorkOrders] =
    useState<ScheduledWorkOrderRow[]>(initialWorkOrders);
  const [editingWO, setEditingWO] = useState<ScheduledWorkOrderRow | null>(
    null,
  );

  // Pure derivations.
  const schedulable = useMemo(
    () =>
      workOrders.map((wo) => ({
        id: wo.id,
        scheduledFor: wo.scheduledFor || null,
        scheduledWindowEnd: wo.scheduledWindowEnd,
        assignedCrewId: wo.assignedCrewId,
      })),
    [workOrders],
  );

  const byDay = useMemo(() => groupByDay(schedulable), [schedulable]);
  const conflicts = useMemo(() => detectConflicts(schedulable), [schedulable]);

  const conflictWOIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) {
      for (const id of c.workOrderIds) s.add(id);
    }
    return s;
  }, [conflicts]);

  const woById = useMemo(
    () => new Map(workOrders.map((wo) => [wo.id, wo])),
    [workOrders],
  );

  const handleSaved = useCallback((updated: ScheduledWorkOrderRow) => {
    setWorkOrders((prev) =>
      updated.scheduledFor
        ? prev.map((wo) => (wo.id === updated.id ? updated : wo))
        : prev.filter((wo) => wo.id !== updated.id),
    );
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <ConflictBanner conflicts={conflicts} />

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-hairline shadow-[var(--shadow-card)]">
        {/* Day headers */}
        {weekDates.map((date) => (
          <div
            key={date}
            className={[
              "bg-surface px-3 py-2 text-center",
              date === today ? "bg-primary/10" : "",
            ].join(" ")}
          >
            <p
              className={[
                "text-[12px] font-semibold",
                date === today ? "text-primary" : "text-faint",
              ].join(" ")}
            >
              {formatDate(date)}
            </p>
          </div>
        ))}

        {/* Day cells */}
        {weekDates.map((date) => {
          const dayWOs = (byDay.get(date) ?? [])
            .map((s) => woById.get(s.id))
            .filter(Boolean) as ScheduledWorkOrderRow[];

          return (
            <div
              key={`cell-${date}`}
              className={[
                "min-h-[160px] bg-background px-2 py-2 space-y-1.5",
                date === today ? "bg-primary/5" : "",
              ].join(" ")}
            >
              {dayWOs.length === 0 ? (
                <p className="text-center text-[11px] text-faint/50 mt-8">—</p>
              ) : (
                dayWOs.map((wo) => (
                  <WorkOrderCard
                    key={wo.id}
                    wo={wo}
                    conflictIds={conflictWOIds}
                    onEdit={setEditingWO}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* Unscheduled WOs */}
      {workOrders.some((wo) => !wo.scheduledFor) && (
        <section className="mt-6">
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">
            Unscheduled work orders
          </h3>
          <div className="space-y-2">
            {workOrders
              .filter((wo) => !wo.scheduledFor)
              .map((wo) => (
                <button
                  key={wo.id}
                  type="button"
                  onClick={() => setEditingWO(wo)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-hairline bg-surface px-4 py-2.5 text-left hover:bg-surface-hover"
                >
                  <span className="text-[13px] font-medium text-foreground truncate">
                    {wo.reportAddress ?? wo.id}
                  </span>
                  <span className="ml-3 shrink-0 text-[12px] text-primary">
                    Schedule →
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* Edit modal */}
      {editingWO && (
        <ScheduleModal
          workOrder={editingWO}
          crews={crews}
          onClose={() => setEditingWO(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

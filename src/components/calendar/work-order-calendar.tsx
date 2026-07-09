"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { MenuSelect } from "@/components/ui/menu-select";
import {
  addMonths,
  type CalendarCell,
  monthGrid,
  monthLabel,
} from "@/lib/calendar-grid";
import type { CalendarWorkOrder } from "@/lib/db/calendar";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Work-order calendar — staff console.

   Plots one city's work orders on a Monday-start month grid by
   `calendarDate` (dispatched_at ?? created_at, computed server-side).
   Month navigation is server-driven via `?month=YYYY-MM` <Link>s — an
   RSC refetch, no client data fetching. The four filters are pure
   client state narrowing the already-fetched month.

   Grayscale staff tokens only (border-hairline, bg-surface/overlay,
   text-subtle/faint, --radius-*). The one data-driven color is a
   chip's left border, tinted with its division color from `teams`.
   ================================================================== */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Chips shown inline before the rest collapse behind "+N more". */
const MAX_VISIBLE_PER_DAY = 3;

const NAV_BTN =
  "inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] font-medium text-subtle outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

interface CalendarCrew {
  id: string;
  name: string;
}
interface CalendarCrewType {
  key: string;
  label: string;
}
interface CalendarTeam {
  id: string;
  label: string;
  color: string;
}

export function WorkOrderCalendar({
  slug,
  orders,
  crews,
  crewTypes,
  teams,
  monthISO,
  todayISO,
}: {
  slug: string;
  orders: CalendarWorkOrder[];
  crews: CalendarCrew[];
  crewTypes: CalendarCrewType[];
  teams: CalendarTeam[];
  /** First-of-month ISO (YYYY-MM-01) the grid renders. */
  monthISO: string;
  todayISO: string;
}) {
  const [fTeam, setFTeam] = useState<string | null>(null);
  const [fType, setFType] = useState<string | null>(null);
  const [fCrew, setFCrew] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const teamId = useId();
  const typeId = useId();
  const crewId = useId();
  const statusId = useId();

  const teamColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.color);
    return m;
  }, [teams]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!fTeam || o.teamKey === fTeam) &&
          (!fType || o.crewType === fType) &&
          (!fCrew || o.crewId === fCrew) &&
          (!fStatus || o.status === fStatus),
      ),
    [orders, fTeam, fType, fCrew, fStatus],
  );

  // Bucket by calendarDate, each bucket sorted priority-desc, nulls last.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarWorkOrder[]>();
    for (const o of filtered) {
      const slot = m.get(o.calendarDate);
      if (slot) slot.push(o);
      else m.set(o.calendarDate, [o]);
    }
    for (const slot of m.values()) {
      slot.sort(
        (a, b) =>
          (b.priorityScore ?? Number.NEGATIVE_INFINITY) -
          (a.priorityScore ?? Number.NEGATIVE_INFINITY),
      );
    }
    return m;
  }, [filtered]);

  const cells = useMemo(
    () => monthGrid(monthISO, todayISO),
    [monthISO, todayISO],
  );

  const monthParam = (delta: number) => addMonths(monthISO, delta).slice(0, 7);
  const todayParam = todayISO.slice(0, 7);
  const onCurrentMonth = monthISO.slice(0, 7) === todayParam;

  const hasFilter = Boolean(fTeam || fType || fCrew || fStatus);
  function clearFilters() {
    setFTeam(null);
    setFType(null);
    setFCrew(null);
    setFStatus(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {monthLabel(monthISO)}
          </h2>
          <nav
            className="inline-flex items-center gap-1"
            aria-label="Change month"
          >
            <Link
              href={`/city/${slug}/calendar?month=${monthParam(-1)}`}
              aria-label="Previous month"
              className={cn(NAV_BTN, "w-9 px-0")}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href={`/city/${slug}/calendar?month=${todayParam}`}
              aria-label="Jump to current month"
              aria-current={onCurrentMonth ? "date" : undefined}
              className={cn(NAV_BTN, onCurrentMonth && "text-faint")}
            >
              Today
            </Link>
            <Link
              href={`/city/${slug}/calendar?month=${monthParam(1)}`}
              aria-label="Next month"
              className={cn(NAV_BTN, "w-9 px-0")}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </nav>
        </div>
        <span className="flex-shrink-0 text-[12px] tabular-nums text-faint">
          {filtered.length} work {filtered.length === 1 ? "order" : "orders"}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterField id={teamId} label="Division">
          <MenuSelect
            id={teamId}
            value={fTeam}
            onChange={setFTeam}
            placeholder="All divisions"
            options={teams.map((t) => ({
              value: t.id,
              label: t.label,
              swatch: t.color,
            }))}
          />
        </FilterField>
        <FilterField id={typeId} label="Crew type">
          <MenuSelect
            id={typeId}
            value={fType}
            onChange={setFType}
            placeholder="All crew types"
            options={crewTypes.map((t) => ({ value: t.key, label: t.label }))}
          />
        </FilterField>
        <FilterField id={crewId} label="Crew">
          <MenuSelect
            id={crewId}
            value={fCrew}
            onChange={setFCrew}
            placeholder="All crews"
            options={crews.map((c) => ({ value: c.id, label: c.name }))}
          />
        </FilterField>
        <FilterField id={statusId} label="Status">
          <MenuSelect
            id={statusId}
            value={fStatus}
            onChange={setFStatus}
            placeholder="Any status"
            options={[
              { value: "open", label: "Open" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </FilterField>
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className={cn(NAV_BTN, "gap-1.5")}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-7 border-b border-hairline bg-overlay/50">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-faint"
            >
              {d}
            </div>
          ))}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: an intentional CSS-grid calendar, not a tabular data set — role="grid"/"gridcell" conveys the 2D layout without <table> markup fighting `grid grid-cols-7`. */}
        <div
          role="grid"
          aria-label={`${monthLabel(monthISO)} work orders`}
          className="grid grid-cols-7"
        >
          {cells.map((cell) => (
            <DayCell
              key={cell.iso}
              cell={cell}
              orders={byDay.get(cell.iso) ?? []}
              slug={slug}
              teamColor={teamColor}
              onShowMore={() => setOpenDay(cell.iso)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-[13px] text-faint">
          {hasFilter
            ? "No work orders match these filters this month."
            : "No work orders land in this month."}
        </p>
      )}

      {openDay && (
        <DayModal
          dayISO={openDay}
          orders={byDay.get(openDay) ?? []}
          slug={slug}
          teamColor={teamColor}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1 sm:w-44">
      <label htmlFor={id} className="text-[11px] font-medium text-faint">
        {label}
      </label>
      {children}
    </div>
  );
}

function DayCell({
  cell,
  orders,
  slug,
  teamColor,
  onShowMore,
}: {
  cell: CalendarCell;
  orders: CalendarWorkOrder[];
  slug: string;
  teamColor: Map<string, string>;
  onShowMore: () => void;
}) {
  const visible = orders.slice(0, MAX_VISIBLE_PER_DAY);
  const overflow = orders.length - visible.length;
  const dayNum = Number.parseInt(cell.iso.slice(8, 10), 10);

  return (
    // biome-ignore lint/a11y/useSemanticElements: paired with the role="grid" container above — a CSS-grid cell, not a <td>.
    // biome-ignore lint/a11y/useFocusableInteractive: the cell is a container, not the focus target — its chip links and "+N more" button carry keyboard focus (normal tab flow, no roving grid navigation by design).
    <div
      role="gridcell"
      aria-label={longDate(cell.iso)}
      className={cn(
        "flex min-h-28 flex-col gap-1 border-r border-b border-hairline p-1.5",
        !cell.inMonth && "bg-overlay/40",
        cell.isToday && "ring-1 ring-inset ring-accent",
      )}
    >
      <div
        className={cn(
          "text-[11px] font-medium tabular-nums",
          cell.inMonth ? "text-subtle" : "text-faint",
          cell.isToday && "font-semibold text-foreground",
        )}
      >
        {dayNum}
      </div>
      {visible.map((o) => (
        <Chip key={o.id} order={o} slug={slug} teamColor={teamColor} />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onShowMore}
          aria-label={`Show ${overflow} more on ${longDate(cell.iso)}`}
          className="w-full rounded-[calc(var(--radius-md)-2px)] px-1.5 py-0.5 text-left text-[10px] font-medium text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-subtle focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

function Chip({
  order,
  slug,
  teamColor,
}: {
  order: CalendarWorkOrder;
  slug: string;
  teamColor: Map<string, string>;
}) {
  const color =
    (order.teamKey && teamColor.get(order.teamKey)) || "var(--border-hairline)";
  const completed = order.status === "completed";
  return (
    <Link
      href={`/city/${slug}/grid`}
      title={`${order.title}${order.crewName ? ` · ${order.crewName}` : ""}`}
      style={{ borderLeftColor: color }}
      className={cn(
        "block truncate rounded-[calc(var(--radius-md)-2px)] border-l-2 bg-overlay px-1.5 py-0.5 text-[11px] leading-tight text-foreground outline-none transition-colors duration-150 hover:bg-overlay-strong focus-visible:ring-2 focus-visible:ring-accent/60",
        completed && "text-subtle line-through opacity-60",
      )}
    >
      {order.title}
    </Link>
  );
}

function DayModal({
  dayISO,
  orders,
  slug,
  teamColor,
  onClose,
}: {
  dayISO: string;
  orders: CalendarWorkOrder[];
  slug: string;
  teamColor: Map<string, string>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; the dialog itself and its links carry the interactive semantics, and Escape is handled above.
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is the Escape handler in the effect above; this onClick is the pointer-only backdrop dismiss.
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-20 animate-[city-pop_120ms_ease-out] motion-reduce:animate-none"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: this onClick only halts propagation so an inside click doesn't dismiss the backdrop — there is no action to bind a key to; Escape-to-close lives in the effect above. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Work orders on ${longDate(dayISO)}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">
              {orders.length} {orders.length === 1 ? "order" : "orders"}
            </p>
            <h3 className="text-[14px] font-semibold text-foreground">
              {longDate(dayISO)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar p-3">
          {orders.map((o) => (
            <Chip key={o.id} order={o} slug={slug} teamColor={teamColor} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Wednesday, July 1, 2026" — UTC-formatted so it matches the ISO key. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

"use client";

import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { TipChip, TipRow, useHoverTip } from "@/components/analytics/hover-tip";
import { MenuSelect } from "@/components/ui/menu-select";
import { Modal } from "@/components/ui/modal";
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

   Grayscale staff tokens for the frame (border-hairline, bg-surface/
   overlay, text-subtle/faint, --radius-*). Chips carry their division
   color: a theme-aware `color-mix` tint of `--surface` for the fill +
   border, a solid leading dot, and a deeper tint on hover. Hovering a
   chip opens the shared analytics hover-tip (division, crew, category,
   status, dispatch date) via `useHoverTip`.
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
  lockedCrewType,
  lockedCrewId,
}: {
  slug: string;
  orders: CalendarWorkOrder[];
  crews: CalendarCrew[];
  crewTypes: CalendarCrewType[];
  teams: CalendarTeam[];
  /** First-of-month ISO (YYYY-MM-01) the grid renders. */
  monthISO: string;
  todayISO: string;
  /** Crew-portal scope (src/app/city/[slug]/crew/[crewType]/calendar/page.tsx):
   *  pins the Crew-type filter to this key and hides its picker entirely — a
   *  locked constant, not a default the user could nudge away from. Absent
   *  (the city calendar route) → behavior is unchanged. */
  lockedCrewType?: string;
  /** Per-crew instance scope (?crew=<name> resolved server-side to an id):
   *  pins the Crew filter to this id and hides its picker, exactly like
   *  lockedCrewType does for crew types. Absent → behavior is unchanged. */
  lockedCrewId?: string;
}) {
  const [fTeam, setFTeam] = useState<string | null>(null);
  const [fType, setFType] = useState<string | null>(lockedCrewType ?? null);
  const [fCrew, setFCrew] = useState<string | null>(lockedCrewId ?? null);
  const [fStatus, setFStatus] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The locks always win over client state, regardless of how fType/fCrew got
  // set — constants, not merely initial values.
  const effectiveType = lockedCrewType ?? fType;
  const effectiveCrew = lockedCrewId ?? fCrew;

  // Month-nav links stay inside the crew portal when locked — otherwise
  // "Next month" would silently drop the user onto the unscoped city
  // calendar, losing the lock.
  const calendarPath = lockedCrewType
    ? `/city/${slug}/crew/${lockedCrewType}/calendar`
    : `/city/${slug}/calendar`;

  // Preserve the ?crew= instance scope across month-nav links (same reason the
  // crew-type lock keeps you inside the portal): resolve the locked crew's
  // name from the crews list so "Next month" doesn't drop the scope. The page
  // guarantees the locked crew is in `crews` even when inactive.
  const lockedCrewName = lockedCrewId
    ? crews.find((c) => c.id === lockedCrewId)?.name
    : undefined;
  const crewQuery = lockedCrewName
    ? `&crew=${encodeURIComponent(lockedCrewName)}`
    : "";

  const teamId = useId();
  const typeId = useId();
  const crewId = useId();
  const statusId = useId();

  const teamColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.color);
    return m;
  }, [teams]);
  const teamLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.label);
    return m;
  }, [teams]);

  // Shared analytics hover-tip: deeper per-order context on chip hover,
  // matching the tiles' interaction. Returns the pointer/focus handlers to
  // spread onto a chip; `<tip.Portal />` renders the floating card once below.
  const tip = useHoverTip();
  const bindTip = useCallback(
    (
      order: CalendarWorkOrder,
      color: string,
    ): React.DOMAttributes<HTMLAnchorElement> =>
      tip.bindTarget(() => ({
        title: order.title,
        accent: color,
        body: (
          <div className="flex flex-col gap-1.5">
            <TipRow
              label="Division"
              value={teamLabel.get(order.teamKey ?? "") ?? "Unassigned"}
              accent={color}
            />
            {order.crewName && <TipRow label="Crew" value={order.crewName} />}
            {order.category && (
              <TipRow label="Category" value={prettyCategory(order.category)} />
            )}
            <TipRow
              label="Status"
              value={
                <TipChip
                  tone={order.status === "completed" ? "good" : "neutral"}
                >
                  {order.status === "completed" ? "Completed" : "Open"}
                </TipChip>
              }
            />
          </div>
        ),
        footer: longDate(order.calendarDate),
      })),
    [tip, teamLabel],
  );

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!fTeam || o.teamKey === fTeam) &&
          (!effectiveType || o.crewType === effectiveType) &&
          (!effectiveCrew || o.crewId === effectiveCrew) &&
          (!fStatus || o.status === fStatus),
      ),
    [orders, fTeam, effectiveType, effectiveCrew, fStatus],
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

  // Same terms as hasFilter so a locked crew-portal filter never inflates the
  // badge on the Filters trigger (the picker for it isn't rendered at all).
  const activeFilterCount = [
    fTeam,
    lockedCrewType ? null : fType,
    lockedCrewId ? null : fCrew,
    fStatus,
  ].filter(Boolean).length;
  const hasFilter = activeFilterCount > 0;
  function clearFilters() {
    setFTeam(null);
    if (!lockedCrewType) setFType(null);
    if (!lockedCrewId) setFCrew(null);
    setFStatus(null);
  }

  return (
    // min-h-0 + flex-1 let the month card absorb whatever height the page shell
    // hands down (md+ pins that to one viewport). In the crew portal, whose
    // wrapper is a plain block, flex-1 is inert and the grid falls back to the
    // day cells' own min-height — same look as before.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        data-tour="calendar-toolbar"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {monthLabel(monthISO)}
          </h2>
          <nav
            className="inline-flex items-center gap-1"
            aria-label="Change month"
          >
            <Link
              href={`${calendarPath}?month=${monthParam(-1)}${crewQuery}`}
              aria-label="Previous month"
              className={cn(NAV_BTN, "w-9 px-0")}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href={`${calendarPath}?month=${todayParam}${crewQuery}`}
              aria-label="Jump to current month"
              aria-current={onCurrentMonth ? "date" : undefined}
              className={cn(NAV_BTN, onCurrentMonth && "text-faint")}
            >
              Today
            </Link>
            <Link
              href={`${calendarPath}?month=${monthParam(1)}${crewQuery}`}
              aria-label="Next month"
              className={cn(NAV_BTN, "w-9 px-0")}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </nav>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="text-[12px] tabular-nums text-faint">
            {filtered.length} work {filtered.length === 1 ? "order" : "orders"}
          </span>
          {/* The filters themselves live in a modal so the month grid clears
              the fold; the badge keeps the active ones visible from here. */}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            className={cn(NAV_BTN, "gap-1.5")}
          >
            <SlidersHorizontal
              className="h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden
            />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-accent-contrast">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter work orders"
        description="Narrows the work orders plotted on this month."
        footer={
          <>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilter}
              className={cn(NAV_BTN, "gap-1.5 disabled:opacity-40")}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className={cn(NAV_BTN, "bg-surface")}
            >
              Done
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
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
          {!lockedCrewType && (
            <FilterField id={typeId} label="Crew type">
              <MenuSelect
                id={typeId}
                value={fType}
                onChange={setFType}
                placeholder="All crew types"
                options={crewTypes.map((t) => ({
                  value: t.key,
                  label: t.label,
                }))}
              />
            </FilterField>
          )}
          {!lockedCrewId && (
            <FilterField id={crewId} label="Crew">
              <MenuSelect
                id={crewId}
                value={fCrew}
                onChange={setFCrew}
                placeholder="All crews"
                options={crews.map((c) => ({ value: c.id, label: c.name }))}
              />
            </FilterField>
          )}
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
        </div>
      </Modal>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <div className="grid flex-shrink-0 grid-cols-7 border-b border-hairline bg-overlay/50">
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
          data-tour="calendar-grid"
          role="grid"
          aria-label={`${monthLabel(monthISO)} work orders`}
          // auto-rows-fr (not a fixed 6-row template — monthGrid returns 5
          // rows for some months) so the weeks split whatever height the card
          // has, and fall back to the cells' min-height when it has none.
          // A dense day whose chips exceed that share pushes its row past the
          // fr split; overflow-y-auto then scrolls INSIDE the card rather than
          // clipping the chips or growing the page past one viewport.
          className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto"
        >
          {cells.map((cell) => (
            <DayCell
              key={cell.iso}
              cell={cell}
              orders={byDay.get(cell.iso) ?? []}
              slug={slug}
              teamColor={teamColor}
              bindTip={bindTip}
              onShowMore={() => setOpenDay(cell.iso)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="flex-shrink-0 text-center text-[13px] text-faint">
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

      <tip.Portal />
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
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={id}
        className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint"
      >
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
  bindTip,
  onShowMore,
}: {
  cell: CalendarCell;
  orders: CalendarWorkOrder[];
  slug: string;
  teamColor: Map<string, string>;
  bindTip: (
    order: CalendarWorkOrder,
    color: string,
  ) => React.DOMAttributes<HTMLAnchorElement>;
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
        "flex min-h-24 flex-col gap-1 overflow-hidden border-r border-b border-hairline p-1.5",
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
        <Chip
          key={o.id}
          order={o}
          slug={slug}
          teamColor={teamColor}
          bindTip={bindTip}
        />
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
  bindTip,
}: {
  order: CalendarWorkOrder;
  slug: string;
  teamColor: Map<string, string>;
  /** When present, wires the analytics hover-tip and drops the native title
   *  (so the two tooltips don't stack). Absent inside the day modal. */
  bindTip?: (
    order: CalendarWorkOrder,
    color: string,
  ) => React.DOMAttributes<HTMLAnchorElement>;
}) {
  const color =
    (order.teamKey && teamColor.get(order.teamKey)) || "var(--border-hairline)";
  const completed = order.status === "completed";
  const tipHandlers = bindTip?.(order, color);
  return (
    <Link
      href={`/city/${slug}/grid`}
      {...tipHandlers}
      title={
        tipHandlers
          ? undefined
          : `${order.title}${order.crewName ? ` · ${order.crewName}` : ""}`
      }
      // Division colour lives in the dot only. The chip itself carries no
      // border and no fill: a month grid can hold dozens of these, and a
      // tinted box around every one turned the calendar into a field of
      // rectangles. Hover still gets a quiet neutral fill so the row remains
      // an obvious hit target.
      style={{ "--chip": color } as React.CSSProperties}
      className={cn(
        "relative flex items-center gap-1.5 truncate rounded-[calc(var(--radius-md)-2px)] px-1 py-0.5 text-[11px] leading-tight text-foreground outline-none",
        "transition-colors duration-150 ease-out",
        "hover:bg-overlay",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        completed && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: "var(--chip)" }}
      />
      <span
        className={cn(
          "min-w-0 truncate",
          completed && "text-subtle line-through",
        )}
      >
        {order.title}
      </span>
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

/** "sidewalk_damage" → "Sidewalk Damage" for the hover tip's Category row. */
function prettyCategory(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
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

/* ==================================================================
   Pure month-grid math for the staff work-order calendar.

   Monday-start 6×7 (42-cell) rectangular grid. All arithmetic is UTC:
   the calendar renders the same regardless of the viewer's timezone,
   and the ISO keys line up with `CalendarWorkOrder.calendarDate`
   (a UTC YYYY-MM-DD string from Postgres). We only ever read UTC
   components (getUTC*), never local getters, so a viewer east or west
   of UTC never sees an off-by-one day. No dependencies.
   ================================================================== */

export interface CalendarCell {
  /** YYYY-MM-DD (UTC). */
  iso: string;
  /** False for the leading/trailing days padding the rectangle. */
  inMonth: boolean;
  isToday: boolean;
}

const DAY_MS = 86_400_000;

/** The 1st of `anchorISO`'s month as a UTC Date. Day-1 anchoring means
 *  month arithmetic never overflows (no "Feb 31"). */
function firstOfMonth(anchorISO: string): Date {
  const [y, m] = anchorISO.split("-").map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(y, m - 1, 1));
}

/** 6×7 Monday-start grid covering the month of `anchorISO` (YYYY-MM-DD).
 *  Always 42 cells so the layout height doesn't jump between months. */
export function monthGrid(anchorISO: string, todayISO: string): CalendarCell[] {
  const first = firstOfMonth(anchorISO);
  const month = first.getUTCMonth();
  const year = first.getUTCFullYear();
  // Days to back up from the 1st to reach the Monday that starts the grid.
  // getUTCDay is 0=Sun..6=Sat; (day + 6) % 7 maps Mon→0, Sun→6.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - lead * DAY_MS;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    cells.push({
      iso,
      inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year,
      isToday: iso === todayISO,
    });
  }
  return cells;
}

/** Shift to the 1st of the month `delta` months from `anchorISO`.
 *  Returns a day-1 ISO (YYYY-MM-01) so callers never re-introduce
 *  end-of-month overflow. */
export function addMonths(anchorISO: string, delta: number): string {
  const first = firstOfMonth(anchorISO);
  const d = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1),
  );
  return d.toISOString().slice(0, 10);
}

/** Human month heading, e.g. "July 2026". UTC-formatted so it matches
 *  the ISO anchor with no timezone shift. */
export function monthLabel(anchorISO: string): string {
  return firstOfMonth(anchorISO).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WorkOrderCalendar } from "@/components/calendar/work-order-calendar";
import { monthGrid } from "@/lib/calendar-grid";
import type { CrewTypeDef } from "@/lib/crew-types";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import {
  type CalendarWorkOrder,
  fetchCalendarWorkOrders,
} from "@/lib/db/calendar";
import { fetchActiveCrewTypeDefs } from "@/lib/db/crew-types";
import { type CityCrewsResult, fetchCityCrews } from "@/lib/db/crews";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { TEAM_LIST } from "@/lib/teams";

// Auth-gated per request (reads cookies via getStaffAccessForCity) and the
// visible month depends on `?month=` + "today", never prerender or cache.
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}

/** "YYYY-MM" for the current month in SERVER-LOCAL time, the default when
 *  `?month=` is absent or fails MONTH_RE. Local (not UTC) on purpose: for a
 *  US-evening viewer, UTC has already rolled to tomorrow, which would open
 *  the calendar on the wrong month at month boundaries and ring the wrong
 *  "today" cell. Server-local is the best proxy we have for the city's day. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Today as YYYY-MM-DD in server-local time, same rationale as currentMonth. */
function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Day after `iso` (YYYY-MM-DD), UTC, turns the grid's last cell into the
 *  exclusive upper bound the accessor's [fromISO, toISO) window expects. */
function isoPlusOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  return {
    title: `Civic | ${city.name}, ${city.state}. Calendar`,
    description: `Staff calendar of work orders landing in ${city.name}, filterable by division, crew, and status.`,
    // Staff-operational surface. Keep it out of search indexes like Members.
    robots: { index: false, follow: false },
  };
}

export default async function CityCalendarPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { month: monthParam } = await searchParams;

  // Resolve the city the way members/grid do: real DB row first, falling
  // back to the synthetic KNOWN_CITIES entry so demo slugs still resolve.
  // The city lookup and the staff gate are independent reads; run them
  // together instead of paying the auth round trip after the city round trip.
  // The CHECK order below is unchanged, a missing city still 404s before the
  // gate can redirect.
  const [dbCityResult, access] = await Promise.all([
    fetchCityFromDb(slug).catch(() => null),
    getStaffAccessForCity(slug),
  ]);
  const dbCity = dbCityResult;
  const city = dbCity ?? (await fetchCityMock(slug));
  if (!city) notFound();

  // Staff-operational gate. Calendar has no PII, so demo access is fine and
  // no admin requirement applies (unlike the Members roster).
  if (!access) {
    redirect(`/login?redirect=/city/${slug}/calendar`);
  }

  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const monthISO = `${month}-01`;
  const todayISO = todayLocalISO();
  const cells = monthGrid(monthISO, todayISO);
  const fromISO = cells[0].iso;
  const toISO = isoPlusOneDay(cells[cells.length - 1].iso);

  // Synthetic (non-DB) cities have no real work orders, skip the fetches
  // rather than querying a placeholder city id.
  const [orders, crewsResult, crewTypeDefs] = dbCity
    ? await Promise.all([
        fetchCalendarWorkOrders(dbCity.id, fromISO, toISO),
        fetchCityCrews(dbCity.id),
        fetchActiveCrewTypeDefs(dbCity.id),
      ])
    : ([[], null, []] as [
        CalendarWorkOrder[],
        CityCrewsResult | null,
        CrewTypeDef[],
      ]);

  const crews = crewsResult?.ok
    ? crewsResult.crews
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name }))
    : [];
  const crewTypes = crewTypeDefs.map((t) => ({ key: t.key, label: t.label }));
  // Same division source + colors as the sidebar and crews panel.
  const teams = TEAM_LIST.filter((t) => t.id !== "all").map((t) => ({
    id: t.id,
    label: t.shortLabel,
    color: t.color,
  }));

  return (
    // md+ pins the shell to exactly one viewport so the calendar never needs a
    // scroll to reach: dvh resolves BEFORE the html `zoom: 0.9` (--app-zoom)
    // scales it, so divide the zoom back out. Mobile keeps the natural
    // min-h-dvh flow (the fixed CityHeader offset would squeeze a hard height).
    <div className="relative flex min-h-dvh flex-col bg-background md:h-[calc(100dvh/var(--app-zoom,1))] md:min-h-0 md:overflow-hidden">
      <div className="relative mx-auto flex w-full max-w-[1800px] flex-grow flex-col px-3 pt-city-content pb-6 sm:px-4 lg:px-6 md:min-h-0 md:pb-4">
        <section className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Calendar
            </h1>
            <p className="text-[13px] text-faint">
              Work orders landing in {city.name} by dispatch date.
            </p>
          </div>
        </section>

        {dbCity ? (
          <WorkOrderCalendar
            slug={slug}
            orders={orders}
            crews={crews}
            crewTypes={crewTypes}
            teams={teams}
            monthISO={monthISO}
            todayISO={todayISO}
          />
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              No calendar data for demo cities
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              The calendar populates for onboarded cities backed by live work
              orders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

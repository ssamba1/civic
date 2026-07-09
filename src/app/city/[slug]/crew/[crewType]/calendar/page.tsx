import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WorkOrderCalendar } from "@/components/calendar/work-order-calendar";
import { monthGrid } from "@/lib/calendar-grid";
import { isPortalCrewType, portalLabel } from "@/lib/crew-portal";
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

// Same rationale as the city calendar page: auth-gated per request, month
// depends on `?month=` + "today" — never prerender or cache.
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

interface PageProps {
  params: Promise<{ slug: string; crewType: string }>;
  searchParams: Promise<{ month?: string; crew?: string }>;
}

/** "YYYY-MM" for the current month in SERVER-LOCAL time — see the city
 *  calendar page for the full local-vs-UTC rationale. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Today as YYYY-MM-DD in server-local time. */
function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Day after `iso` (YYYY-MM-DD), UTC — exclusive upper bound for the
 *  accessor's [fromISO, toISO) window. */
function isoPlusOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) {
    return { title: "Crew not found | Civic" };
  }
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  const label = portalLabel(crewType);
  return {
    title: `Civic | ${city.name}, ${city.state} — ${label} Calendar`,
    description: `Staff calendar of work orders landing for the ${label} crew in ${city.name}.`,
    // Staff-operational surface — keep it out of search indexes like Members.
    robots: { index: false, follow: false },
  };
}

export default async function CrewPortalCalendarPage({
  params,
  searchParams,
}: PageProps) {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) notFound();
  const { month: monthParam, crew: crewParam } = await searchParams;

  // Resolve the city the way the city calendar page does: real DB row first,
  // falling back to the synthetic KNOWN_CITIES entry so demo slugs resolve.
  let dbCity = null;
  try {
    dbCity = await fetchCityFromDb(slug);
  } catch {
    dbCity = null;
  }
  const city = dbCity ?? (await fetchCityMock(slug));
  if (!city) notFound();

  // Staff-operational gate — calendar has no PII, so demo access is fine.
  const access = await getStaffAccessForCity(slug);
  if (!access) {
    redirect(`/login?redirect=/city/${slug}/crew/${crewType}/calendar`);
  }

  const month =
    monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const monthISO = `${month}-01`;
  const todayISO = todayLocalISO();
  const cells = monthGrid(monthISO, todayISO);
  const fromISO = cells[0].iso;
  const toISO = isoPlusOneDay(cells[cells.length - 1].iso);

  // Orders stay MONTH-fetched, same as the city calendar — the crew lock only
  // pins the client-side filter (see WorkOrderCalendar's lockedCrewType), it
  // doesn't narrow the server query.
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

  // Optional ?crew=<name> instance scope: resolve to a real crew OF THIS TYPE
  // (case-sensitive exact match) against the full roster result. Unresolved
  // (demo city, no such crew) → undefined → type-level calendar, unchanged.
  const lockedCrew =
    crewParam && crewsResult?.ok
      ? crewsResult.crews.find(
          (c) => c.name === crewParam && c.crewType === crewType,
        )
      : undefined;

  const crews = crewsResult?.ok
    ? crewsResult.crews
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name }))
    : [];
  // Keep the locked crew in the list even if inactive (the picker is hidden
  // when locked, so an extra entry is invisible) so the calendar can preserve
  // its name in month-nav links.
  if (lockedCrew && !crews.some((c) => c.id === lockedCrew.id)) {
    crews.push({ id: lockedCrew.id, name: lockedCrew.name });
  }
  const crewTypes = crewTypeDefs.map((t) => ({ key: t.key, label: t.label }));
  // Same division source + colors as the sidebar and crews panel.
  const teams = TEAM_LIST.filter((t) => t.id !== "all").map((t) => ({
    id: t.id,
    label: t.shortLabel,
    color: t.color,
  }));

  const label = portalLabel(crewType);

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Calendar
            </h1>
            <p className="text-[13px] text-faint">
              {label} crew work orders landing in {city.name} by dispatch date.
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
            lockedCrewType={crewType}
            lockedCrewId={lockedCrew?.id}
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

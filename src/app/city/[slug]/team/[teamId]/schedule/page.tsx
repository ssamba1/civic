import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getScheduledWorkOrders } from "@/app/staff/schedule-actions";
import { ScheduleCalendar } from "@/components/staff/schedule-calendar";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { fetchCityCrews } from "@/lib/db/crews";
import { getStaffAccessForCity } from "@/lib/staff-access";

// Auth-gated per-request. Do not cache or prerender.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a 7-element array of ISO dates YYYY-MM-DD starting from `startDate`. */
function buildWeek(startDate: string): string[] {
  const dates: string[] = [];
  const base = new Date(`${startDate}T00:00:00.000Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Return the Monday of the week containing `today` (ISO date). */
function mondayOf(today: string): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun…6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<{ week?: string }>;
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
    title: `Civic | ${city.name}. Team Schedule`,
    description: `Weekly work-order schedule for ${city.name} staff.`,
    robots: { index: false, follow: false },
  };
}

export default async function TeamSchedulePage({
  params,
  searchParams,
}: PageProps) {
  const { slug, teamId } = await params;
  const { week: weekParam } = await searchParams;

  // Resolve city.
  let dbCity = null;
  try {
    dbCity = await fetchCityFromDb(slug);
  } catch {
    dbCity = null;
  }
  const city = dbCity ?? (await fetchCityMock(slug));
  if (!city) notFound();

  // Staff access gate.
  const access = await getStaffAccessForCity(slug);
  if (!access) {
    redirect(`/login?redirect=/city/${slug}/team/${teamId}/schedule`);
  }

  // Resolve the week to display.
  const today = todayISO();
  const weekStart =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : mondayOf(today);
  const weekDates = buildWeek(weekStart);
  // buildWeek always returns 7 entries, so the last is defined.
  const weekEnd = weekDates.at(-1) ?? weekStart;

  // Fetch data (only for real DB cities).
  const [scheduledResult, crewsResult] = dbCity
    ? await Promise.all([
        getScheduledWorkOrders(dbCity.id, weekStart, weekEnd),
        fetchCityCrews(dbCity.id),
      ])
    : [{ ok: true as const, data: [] }, null];

  const workOrders = scheduledResult.ok ? scheduledResult.data : [];
  const crews = crewsResult?.ok
    ? crewsResult.crews
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name }))
    : [];

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Schedule
            </h1>
            <p className="text-[13px] text-faint">
              {city.name}, week of {weekStart}
            </p>
          </div>

          {/* Week navigation */}
          <nav className="flex items-center gap-2" aria-label="Week navigation">
            <a
              href={`/city/${slug}/team/${teamId}/schedule?week=${prevWeek(weekStart)}`}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              ← Prev
            </a>
            <a
              href={`/city/${slug}/team/${teamId}/schedule`}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              Today
            </a>
            <a
              href={`/city/${slug}/team/${teamId}/schedule?week=${nextWeek(weekStart)}`}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              Next →
            </a>
          </nav>
        </section>

        {!dbCity ? (
          // Demo / synthetic city empty state.
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              No schedule data for demo cities
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              The schedule populates for onboarded cities with live work orders.
            </p>
          </div>
        ) : workOrders.length === 0 && crews.length === 0 ? (
          // Real city, no data yet (migration not applied or no WOs scheduled).
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              Nothing scheduled this week
            </p>
            <p className="mt-1.5 text-[13px] text-faint">
              Work orders appear here once scheduled via the work-order detail
              page or the Browse list.
            </p>
          </div>
        ) : (
          <ScheduleCalendar
            weekDates={weekDates}
            workOrders={workOrders}
            crews={crews}
            cityId={dbCity.id}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week math helpers (server-side only)
// ---------------------------------------------------------------------------

function shiftWeek(isoDate: string, offset: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset * 7);
  return d.toISOString().slice(0, 10);
}

function prevWeek(isoDate: string) {
  return shiftWeek(isoDate, -1);
}

function nextWeek(isoDate: string) {
  return shiftWeek(isoDate, 1);
}

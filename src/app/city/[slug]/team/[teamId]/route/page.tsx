import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RoutePlan } from "@/components/staff/route-plan";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { fetchCityCrews } from "@/lib/db/crews";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { getOptimizedRouteForCrew } from "@/app/staff/route-actions";

// Auth-gated per-request — never cache or prerender.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<{ date?: string; crew?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  return {
    title: city ? `Civic | ${city.name} — Crew Route` : "Crew Route | Civic",
    description: "Optimized daily route plan for a crew.",
    robots: { index: false, follow: false },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CrewRoutePage({ params, searchParams }: PageProps) {
  const { slug, teamId } = await params;
  const { date: dateParam, crew: crewParam } = await searchParams;

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
    redirect(`/login?redirect=/city/${slug}/team/${teamId}/route`);
  }

  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayISO();

  // Demo / synthetic cities have no real DB data.
  if (!dbCity) {
    return (
      <RoutePageShell slug={slug} teamId={teamId} date={date} crewParam={crewParam}>
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium text-foreground">
            No route data for demo cities
          </p>
          <p className="mt-1.5 text-[13px] text-faint">
            Route optimisation runs for onboarded cities with live work orders.
          </p>
        </div>
      </RoutePageShell>
    );
  }

  // Load crews so the page can show a picker and resolve the selected crew name.
  const crewsResult = await fetchCityCrews(dbCity.id);
  const crews = crewsResult.ok
    ? crewsResult.crews.filter((c) => c.active)
    : [];

  const selectedCrewId = crewParam ?? crews[0]?.id ?? null;
  const selectedCrew = crews.find((c) => c.id === selectedCrewId) ?? null;

  // Fetch optimized route.
  const routeResult = selectedCrewId
    ? await getOptimizedRouteForCrew(selectedCrewId, date)
    : null;

  const route = routeResult?.ok ? routeResult.data : null;

  return (
    <RoutePageShell
      slug={slug}
      teamId={teamId}
      date={date}
      crewParam={crewParam}
      crews={crews.map((c) => ({ id: c.id, name: c.name }))}
      selectedCrewId={selectedCrewId}
    >
      <RoutePlan route={route} crewName={selectedCrew?.name} />
    </RoutePageShell>
  );
}

// ---------------------------------------------------------------------------
// Shell (layout + controls)
// ---------------------------------------------------------------------------

interface Crew {
  id: string;
  name: string;
}

interface ShellProps {
  slug: string;
  teamId: string;
  date: string;
  crewParam?: string;
  crews?: Crew[];
  selectedCrewId?: string | null;
  children: React.ReactNode;
}

function RoutePageShell({
  slug,
  teamId,
  date,
  crews = [],
  selectedCrewId,
  children,
}: ShellProps) {
  const basePath = `/city/${slug}/team/${teamId}/route`;

  // Build date navigation helpers (±1 day).
  function shiftDay(isoDate: string, offset: number): string {
    const d = new Date(`${isoDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  const prevDate = shiftDay(date, -1);
  const nextDate = shiftDay(date, 1);

  function href(d: string, crew?: string | null) {
    const p = new URLSearchParams({ date: d });
    if (crew) p.set("crew", crew);
    return `${basePath}?${p.toString()}`;
  }

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1200px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header */}
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Crew Route
            </h1>
            <p className="text-[13px] text-faint">{date}</p>
          </div>

          {/* Day navigation */}
          <nav className="flex items-center gap-2" aria-label="Day navigation">
            <a
              href={href(prevDate, selectedCrewId)}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              ← Prev
            </a>
            <a
              href={href(date, selectedCrewId)}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              Today
            </a>
            <a
              href={href(nextDate, selectedCrewId)}
              className="rounded-[var(--radius-sm)] border border-hairline px-3 py-1.5 text-[13px] text-faint hover:bg-surface-hover"
            >
              Next →
            </a>
          </nav>
        </section>

        {/* Crew picker */}
        {crews.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" role="list" aria-label="Crew selector">
            {crews.map((c) => (
              <a
                key={c.id}
                href={href(date, c.id)}
                role="listitem"
                className={[
                  "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                  c.id === selectedCrewId
                    ? "border-brand bg-brand text-white"
                    : "border-hairline text-faint hover:bg-surface-hover",
                ].join(" ")}
              >
                {c.name}
              </a>
            ))}
          </div>
        )}

        {/* Content */}
        {children}
      </div>
    </div>
  );
}

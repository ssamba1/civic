import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
import { isPortalCrewType, portalLabel } from "@/lib/crew-portal";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { fetchCityCrews } from "@/lib/db/crews";
import type { City } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string; crewType: string }>;
  searchParams: Promise<{ crew?: string }>;
}

// DB first (provisioned cities), then the mock fallback (demo deploy) — same
// resolution order as the crew overview page (../page.tsx).
async function resolveCity(slug: string): Promise<City | null> {
  let city: City | null = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  return city;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) {
    return { title: "Crew not found | Civic" };
  }
  const city = await resolveCity(slug);
  if (!city) return { title: "Crew not found | Civic" };
  const label = portalLabel(crewType);
  return {
    title: `Civic | ${city.name} — ${label} Crew Analytics`,
    description: `Operational analytics for the ${label} crew in ${city.name}, ${city.state}.`,
  };
}

export default async function CrewPortalAnalyticsPage({
  params,
  searchParams,
}: PageProps) {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) notFound();
  const city = await resolveCity(slug);
  if (!city) notFound();

  const label = portalLabel(crewType);

  // Analytics is report-level: it renders AnalyticsInteractive under the crew
  // layout's category-locked FilterProvider, so the corpus is already scoped
  // to this crew TYPE. A single crew instance can't narrow it further — the
  // ?crew=<name> param only names the crew in the heading (so the crews-panel
  // click-through reads coherently); it never invents fake per-crew scoping.
  const { crew: crewParam } = await searchParams;
  let crewName: string | undefined;
  if (crewParam) {
    const crewsResult = await fetchCityCrews(city.id);
    if (crewsResult.ok) {
      crewName = crewsResult.crews.find(
        (c) => c.name === crewParam && c.crewType === crewType,
      )?.name;
    }
  }

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {city.name}, {city.state} · {crewName ?? `${label} Crew`}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Analytics
            </h1>
            <p className="text-[13px] text-faint">
              {label} crew operational signal — resolution, backlog, and where
              it&apos;s happening.
            </p>
          </div>
        </section>

        <AnalyticsInteractive />
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}

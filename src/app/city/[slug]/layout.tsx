import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { CitySidebar } from "@/components/city-sidebar";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchRecentReports } from "@/lib/dashboard-queries";
import { DEMO_CITY } from "@/lib/demo-auth";
import { FilterProvider } from "@/lib/filters/context";
import { isStaffForCity } from "@/lib/staff-access";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Resolve the real city identity first — used for the header and to load the
  // city's live reports below.
  const city = await fetchCity(slug);

  // Nav-visibility only (not a security gate — the grid page enforces its own
  // requireStaffFor() redirect). Demo city always counts as staff here too,
  // matching the grid page's own `slug !== DEMO_CITY` bypass, so its Grid tab
  // stays visible to every visitor.
  const isStaff = slug === DEMO_CITY || (await isStaffForCity(slug));

  // Cumming ships with the rich synthetic demo corpus (slug-agnostic). Every
  // other (onboarded) city loads its OWN live reports from the DB so its
  // dashboard, workload, and map reflect real data — the live PostGIS point,
  // AI category/severity, and status — instead of looking empty.
  const corpus =
    slug in KNOWN_CITIES
      ? getReportCorpus()
      : city
        ? await fetchRecentReports(city.id, 500)
        : [];
  const now = Date.now();

  return (
    // Column on mobile (fixed CityHeader on top); row on md+ where the
    // sticky CitySidebar owns the left rail and flexbox owns content width.
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <CityHeader
        slug={slug}
        cityName={city?.name ?? null}
        cityState={city?.state ?? null}
        isStaff={isStaff}
      />
      <CitySidebar
        slug={slug}
        cityName={city?.name ?? null}
        cityState={city?.state ?? null}
        isStaff={isStaff}
      />

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now}>
          {/*
           * Mobile top offset for the FIXED CityHeader is owned by each
           * content page via the `pt-city-content` utility (globals.css),
           * which is safe-area-aware. On md+ the header is gone (sidebar
           * shell instead) so the utility collapses to plain page padding.
           */}
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}

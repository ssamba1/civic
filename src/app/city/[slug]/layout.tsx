import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { CitySidebar } from "@/components/city-sidebar";
import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_CITY } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { FilterProvider } from "@/lib/filters/context";
import { isStaffForCity } from "@/lib/staff-access";
import { VIDEO_PIPELINE } from "@/lib/video/config";

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

  const now = Date.now();

  // Demo deploy keeps the rich synthetic corpus for the known demo city; every
  // other (onboarded) city — and every city on a real deploy — loads its OWN
  // reports from the DB per city_id (F1) so its dashboard, workload, and map
  // reflect real data. A preview (not-yet-live) city includes synthetic/imported
  // sources so its dashboard looks alive.
  let corpus: DashboardReport[];
  if (DEMO_MODE && slug in KNOWN_CITIES) {
    corpus = getReportCorpus();
  } else {
    corpus = city
      ? await fetchCorpus(city.id, city.active ? undefined : PREVIEW_SOURCES)
      : [];
  }

  return (
    // Column on mobile (fixed CityHeader on top); row on md+ where the
    // sticky CitySidebar owns the left rail and flexbox owns content width.
    // dvh is resolved before the html zoom (globals.css --app-zoom) scales
    // it — divide back out so full-viewport routes (map) reach the bottom
    // instead of stopping 10% short.
    <div className="flex min-h-[calc(100dvh/var(--app-zoom,1))] flex-col bg-background text-foreground md:flex-row">
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
        videoEnabled={VIDEO_PIPELINE}
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

import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchRecentReports } from "@/lib/dashboard-queries";
import { FilterProvider } from "@/lib/filters/context";

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <CityHeader
        slug={slug}
        cityName={city?.name ?? null}
        cityState={city?.state ?? null}
      />

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now}>
          {/*
           * Top offset for the FIXED CityHeader is owned by each content page
           * via the `pt-city-content` utility (globals.css), which is
           * safe-area-aware. The old scheme (h-7 spacer + per-page pt-20) was
           * not inset-aware and buried content under the notch on iPhones.
           */}
          <main className="flex-1 flex flex-col">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}

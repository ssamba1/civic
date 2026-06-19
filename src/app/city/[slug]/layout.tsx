import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import { FilterProvider } from "@/lib/filters/context";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // The demo corpus is synthetic, Cumming-centered, and slug-agnostic. Serve it
  // only for cities that ship with it (KNOWN_CITIES = Cumming); every onboarded
  // city gets an empty corpus so its dashboard, workload, and map reflect its
  // own (real, initially empty) data instead of looking like Cumming.
  const corpus = slug in KNOWN_CITIES ? getReportCorpus() : [];
  const now = Date.now();

  // Resolve the real city identity so a freshly-onboarded city's header shows
  // its own name/state rather than falling back to the first municipality.
  const city = await fetchCity(slug);

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

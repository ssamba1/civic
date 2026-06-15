import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_MODE } from "@/lib/demo-mode";
import { FilterProvider } from "@/lib/filters/context";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const now = Date.now();

  // Demo deploy keeps the synthetic Cumming corpus (unchanged). Real deploy reads
  // the city's own reports from the DB per city_id (F1) — a preview (not-yet-live)
  // city includes synthetic/imported sources so its dashboard looks alive.
  let corpus: DashboardReport[];
  if (DEMO_MODE) {
    corpus = getReportCorpus();
  } else {
    const city = await fetchCity(slug);
    corpus = city
      ? await fetchCorpus(city.id, city.active ? undefined : PREVIEW_SOURCES)
      : [];
  }

  return (
    <div className="flex min-h-dvh flex-col bg-black text-zinc-100">
      <CityHeader slug={slug} />

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

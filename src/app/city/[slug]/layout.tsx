import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { FilterProvider } from "@/lib/filters/context";
import { getReportCorpus } from "@/lib/dashboard-data";

export default async function CityDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const corpus = getReportCorpus();
  const now = Date.now();

  return (
    <div className="flex min-h-dvh flex-col bg-black text-zinc-100">
      <CityHeader slug={slug} />

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now}>
          {/*
           * Mobile header is two rows: row1 h-14 (56px) + row2 nav ~52px = ~108px total.
           * Pages already pad pt-20 (80px) for the old single-row header.
           * Delta on mobile: 108-80 = 28px → h-7 spacer visible on mobile only.
           * Desktop header is still h-14 (56px), pages' existing pt-20 is sufficient there.
           */}
          <div className="h-7 md:hidden" aria-hidden="true" />
          <main className="flex-1 flex flex-col">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}

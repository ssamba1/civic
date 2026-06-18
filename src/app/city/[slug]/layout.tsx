import { Suspense } from "react";
import { CityHeader } from "@/components/city-header";
import { getReportCorpus } from "@/lib/dashboard-data";
import { FilterProvider } from "@/lib/filters/context";

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
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

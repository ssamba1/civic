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
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <CityHeader slug={slug} />

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now}>
          <main className="flex-1 flex flex-col">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}

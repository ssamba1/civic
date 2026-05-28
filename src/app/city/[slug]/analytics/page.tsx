import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import {
  fetchAnalyticsKpis,
  fetchReportsTrend,
  fetchResolutionDistribution,
  fetchStatusFunnel,
  fetchSeverityDistribution,
  fetchHourlyHeatmap,
  fetchTopNeighborhoods,
  fetchCategoryResolution,
  fetchReporterVelocity,
} from "@/lib/analytics-data";
import {
  KpiCards,
  ReportsTrend,
  SeverityDonut,
  StatusFunnel,
  ResolutionHistogram,
  PeakHoursHeatmap,
  TopNeighborhoods,
  CategoryResolutionTable,
  ReporterVelocityCard,
} from "@/components/analytics/analytics-bento";

export function generateStaticParams() {
  return Object.keys(KNOWN_CITIES).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) return { title: "City not found | Civic" };
  const title = `Civic | ${city.name}, ${city.state} — Analytics`;
  return {
    title,
    description: `Operational analytics for ${city.name}, ${city.state}: resolution rate, MTTR, SLA compliance, peak reporting hours, and per-category performance.`,
  };
}

export default async function CityAnalyticsPage({ params }: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  const [
    kpis,
    trend,
    distribution,
    funnel,
    severity,
    heatmap,
    neighborhoods,
    categoryRes,
    velocity,
  ] = await Promise.all([
    fetchAnalyticsKpis(city.id),
    fetchReportsTrend(city.id, 14),
    fetchResolutionDistribution(city.id),
    fetchStatusFunnel(city.id),
    fetchSeverityDistribution(city.id),
    fetchHourlyHeatmap(city.id),
    fetchTopNeighborhoods(city.id),
    fetchCategoryResolution(city.id),
    fetchReporterVelocity(city.id),
  ]);

  return (
    <div className="relative flex flex-col min-h-screen bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#161618_0%,#0c0c0e_35%,#050506_75%,#000_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(10,132,255,0.04),transparent_55%)]" />
      <div className="relative flex-grow mx-auto w-full max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-8">
          <p className="text-[13px] text-zinc-500">
            {city.name}, {city.state}
          </p>
          <h1 className="mt-1 text-[34px] sm:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
            Analytics
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where it&apos;s happening.
          </p>
        </section>

        <div className="space-y-4 animate-in fade-in duration-500">
          {/* KPI strip */}
          <KpiCards kpis={kpis} />

          {/* Bento grid */}
          <div className="grid gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(190px,auto)]">
            <ReportsTrend data={trend} />
            <SeverityDonut data={severity} />
            <ReporterVelocityCard data={velocity} />
            <StatusFunnel data={funnel} />
            <ResolutionHistogram data={distribution} />
            <PeakHoursHeatmap data={heatmap} />
            <TopNeighborhoods data={neighborhoods} />
            <CategoryResolutionTable data={categoryRes} />
          </div>
        </div>
      </div>

      <footer className="border-t border-white/[0.06] mt-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
import { DistrictRollups } from "@/components/analytics/district-rollups";
import { EquityPanel } from "@/components/analytics/equity-panel";
import { SurgeBanner } from "@/components/analytics/surge-banner";
import { fetchCity } from "@/lib/dashboard-queries";

// Static generation is impossible under the city layout, which reads the auth
// cookie via isStaffForCity() on every request. Declaring generateStaticParams()
// made Next attempt it for slugs outside the list and throw
// DYNAMIC_SERVER_USAGE, turning an unknown city into a 500 instead of a 404.
export const dynamic = "force-dynamic";

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

/** Streaming placeholder for the district/equity panels. Same card chrome and
 *  heading weight as the real sections so the swap-in causes no shift. */
function PanelSkeleton({ label }: { label: string }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5">
      <h2 className="mb-1 text-[13px] font-semibold text-foreground">
        {label}
      </h2>
      <div className="skeleton mt-2 h-3 w-48 rounded" />
    </section>
  );
}

export default async function CityAnalyticsPage({ params }: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Compact page header — single slim row. The KPI tiles below already
            carry the counts, so a chip row here would state them twice. */}
        <section className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Analytics
          </h1>
          <p className="text-[13px] text-faint">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where
            it&apos;s happening.
          </p>
        </section>

        <SurgeBanner />
        <AnalyticsInteractive />

        {/* Server-rendered analytics panels — fetch independently so they
            degrade gracefully when RPCs/tables are absent, and stream in
            behind Suspense so a slow districts/equity RPC never holds up the
            rest of the page. Both always render a card, so their fallbacks are
            same-shaped skeletons and the swap is geometry-neutral. */}
        <div className="mt-6 space-y-4">
          <Suspense fallback={<PanelSkeleton label="Council Districts" />}>
            <DistrictRollups cityId={city.id} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton label="Response Equity" />}>
            <EquityPanel cityId={city.id} />
          </Suspense>
        </div>
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

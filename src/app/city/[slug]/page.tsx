import { Camera } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterBar } from "@/components/filters/filter-bar";
import { TeamsInteractive } from "@/components/teams/teams-interactive";
import { Button } from "@/components/ui/button";
import { fetchCity as fetchCityMock, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity as fetchCityFromDb,
  fetchCityStats,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";

// Pre-render known cities; provisioned cities render on demand (no redeploy).
export const dynamicParams = true;

export function generateStaticParams() {
  return Object.keys(KNOWN_CITIES).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) {
    city = await fetchCityMock(slug);
  }
  if (!city) return { title: "City not found | Civic" };

  const title = `Civic | ${city.name}, ${city.state} — Teams & Delegation`;
  const description = `Per-team workload and delegation for ${city.name}, ${city.state}. Backlog by division, default routing rules, per-report reassignment.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Civic",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CityDashboardPage({ params }: PageProps) {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) {
    city = await fetchCityMock(slug);
  }
  if (!city) notFound();

  // A not-yet-live city is in preview: include synthetic/imported in its KPIs so
  // the dashboard looks alive. Live cities default to resident-only (clean KPIs).
  const stats = await fetchCityStats(
    city.id,
    city.active ? undefined : PREVIEW_SOURCES,
  );

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        {/* Compact page header — the sidebar carries location context on md+,
            so the title collapses to a single slim row. */}
        <section className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
                Teams
              </h1>
              <p className="text-[13px] text-faint">
                Workload, delegation, and queue depth across municipal
                divisions.
              </p>
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[12px] text-subtle">
                  <span className="font-semibold text-foreground">
                    {stats.total.toLocaleString()}
                  </span>
                  tracked
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[12px] text-subtle">
                  <span className="font-semibold text-foreground">
                    {stats.open}
                  </span>
                  open
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[12px] text-subtle">
                  <span className="font-semibold text-foreground">
                    {stats.this_week}
                  </span>
                  this week
                </span>
              </div>
            </div>
            {/* Sidebar owns the Report CTA on md+; keep it for mobile only. */}
            <Button asChild className="min-w-[44px] self-start md:hidden">
              <Link href="/report">
                <Camera className="h-4 w-4" />
                Report an issue
              </Link>
            </Button>
          </div>
        </section>

        <div className="mb-6">
          <FilterBar />
        </div>

        <TeamsInteractive initialStats={stats} />
      </div>

      <footer className="border-t border-hairline mt-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-faint sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}

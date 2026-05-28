import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Camera, MapPin, ArrowRight } from "lucide-react";
import Link from "next/link";

import { KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCityStats,
  fetchCategoryBreakdown,
  fetchRecentReports,
} from "@/lib/dashboard-queries";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";

/* ------------------------------------------------------------------
   Static generation
   ------------------------------------------------------------------ */

export function generateStaticParams() {
  return Object.keys(KNOWN_CITIES).map((slug) => ({ slug }));
}

/* ------------------------------------------------------------------
   SEO metadata
   ------------------------------------------------------------------ */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) return { title: "City not found | Civic" };

  const title = `Civic | ${city.name}, ${city.state} — Infrastructure Report Dashboard`;
  const description = `Real-time infrastructure report dashboard for ${city.name}, ${city.state}. View open issues, resolution times, and report new problems.`;

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

/* ------------------------------------------------------------------
   Page component
   ------------------------------------------------------------------ */

export default async function CityDashboardPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { focus } = await searchParams;

  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];

  // parallel data fetching
  const [stats, categories, reports] = await Promise.all([
    fetchCityStats(city.id),
    fetchCategoryBreakdown(city.id),
    fetchRecentReports(city.id, 20),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* hero header */}
        <section className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <MapPin className="h-4 w-4" />
                Public Dashboard
              </div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                {city.name}, {city.state}
              </h1>
              <p className="mt-2 text-zinc-500">
                {stats.total} reports tracked &middot; {stats.open} open issues
                &middot; {stats.this_week} new this week
              </p>
            </div>
            <Link
              href="/report"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Camera className="h-4 w-4" />
              Report an Issue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* interactive client-side dashboard system */}
        <DashboardInteractive
          initialStats={stats}
          initialCategories={categories}
          initialReports={reports}
          center={known?.center ?? [-84.14, 34.21]}
          zoom={known?.zoom ?? 12}
        />
      </div>

      {/* footer */}
      <footer className="border-t border-zinc-200 bg-white shrink-0">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
              C
            </span>
            <span>Powered by Civic</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              Open311 Compatible
            </span>
            <span>&copy; {new Date().getFullYear()} Civic</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

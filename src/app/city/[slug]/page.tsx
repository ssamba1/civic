import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import Link from "next/link";

import { KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCityStats,
  fetchCategoryBreakdown,
  fetchRecentReports,
  fetchUserUpvotes,
} from "@/lib/dashboard-queries";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";

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
  const city = await fetchCity(slug);
  if (!city) return { title: "City not found | Civic" };

  const title = `Civic | ${city.name}, ${city.state} — Infrastructure Telemetry`;
  const description = `Real-time infrastructure telemetry for ${city.name}, ${city.state}. Live 3D pillar map, incident feed, resolution metrics.`;

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

export default async function CityDashboardPage({
  params,
}: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];

  // parallel data fetching
  const [stats, categories, reports, upvotedIds] = await Promise.all([
    fetchCityStats(city.id),
    fetchCategoryBreakdown(city.id),
    fetchRecentReports(city.id, 20),
    fetchUserUpvotes(),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[13px] text-zinc-500">
                {city.name}, {city.state}
              </p>
              <h1 className="mt-1 text-[34px] sm:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
                Public infrastructure
              </h1>
              <p className="mt-3 text-sm text-zinc-400">
                {stats.total.toLocaleString()} tracked
                <span className="mx-2 text-zinc-700">·</span>
                {stats.open} open
                <span className="mx-2 text-zinc-700">·</span>
                {stats.this_week} this week
              </p>
            </div>
            <Link
              href="/report"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#0a84ff] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#0070e0]"
            >
              <Camera className="h-4 w-4" />
              Report an issue
            </Link>
          </div>
        </section>

        <DashboardInteractive
          initialStats={stats}
          initialCategories={categories}
          initialReports={reports}
          center={known?.center ?? [-84.14, 34.21]}
          zoom={known?.zoom ?? 12}
          upvotedIds={upvotedIds}
        />
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

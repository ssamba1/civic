import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";

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

  return (
    <div className="relative flex flex-col min-h-screen bg-black">
      <div className="relative flex-grow mx-auto w-full max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-8">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#0a84ff] shadow-[0_0_6px_rgba(10,132,255,0.6)]"
              aria-hidden="true"
            />
            {city.name}, {city.state}
          </p>
          <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
            Analytics
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where it&apos;s happening.
          </p>
        </section>

        <AnalyticsInteractive />
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

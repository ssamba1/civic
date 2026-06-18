import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";

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
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-6">
          <h1 className="text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where
            it&apos;s happening.
          </p>
        </section>

        <AnalyticsInteractive />
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-faint sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}

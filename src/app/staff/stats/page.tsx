import { Suspense } from "react";
import { FilterProvider } from "@/lib/filters/context";
import { getReportCorpus } from "@/lib/dashboard-data";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";

// Staff stats view — reuses the public analytics bento, wrapped in its own
// FilterProvider (the staff layout has none, unlike the city layout).
export default function StaffStatsPage() {
  const corpus = getReportCorpus();
  const now = Date.now();

  return (
    <div className="min-h-full bg-black">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-6">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            <span
              className="h-1.5 w-1.5 rounded-full bg-blue-500"
              aria-hidden="true"
            />
            Cumming, GA
          </p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-white sm:text-[34px]">
            Stats
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where it&apos;s happening.
          </p>
        </section>

        <Suspense fallback={null}>
          <FilterProvider corpus={corpus} now={now}>
            <AnalyticsInteractive />
          </FilterProvider>
        </Suspense>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
import { getReportCorpus } from "@/lib/dashboard-data";
import { FilterProvider } from "@/lib/filters/context";

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
            Operational signal — what&apos;s shipping, what&apos;s stuck, where
            it&apos;s happening.
          </p>
        </section>

        <Suspense fallback={<StatsBentoSkeleton />}>
          <FilterProvider corpus={corpus} now={now}>
            <AnalyticsInteractive />
          </FilterProvider>
        </Suspense>
      </div>
    </div>
  );
}

// Bento-grid ghost matching the analytics layout — prevents the empty→full
// layout jump when AnalyticsInteractive streams in. Pulse-only, dark theme.
function StatsBentoSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        "h-28",
        "h-28",
        "h-28",
        "h-28",
        "h-64 sm:col-span-2",
        "h-64 sm:col-span-2",
        "h-72 lg:col-span-3",
        "h-72",
      ].map((h, i) => (
        <div
          key={i}
          className={`${h} animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/60`}
        />
      ))}
    </div>
  );
}

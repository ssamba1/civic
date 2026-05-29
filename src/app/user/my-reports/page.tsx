import type { Metadata } from "next";

import { fetchCity } from "@/lib/dashboard-queries";
import { getCurrentResident, getMyReports } from "@/lib/resident-data";
import { MyReportsInteractive } from "@/components/resident/my-reports-interactive";

export async function generateMetadata(): Promise<Metadata> {
  const city = await fetchCity("cumming");
  const cityName = city?.name ?? "Cumming";
  return {
    title: `Civic | ${cityName} — My Reports`,
    description: `Track every report you've filed in ${cityName}: what's being worked on, what's resolved, and your civic impact.`,
  };
}

export default async function MyReportsPage() {
  const { citySlug, displayName } = await getCurrentResident();
  const reports = await getMyReports(citySlug);

  const firstName = displayName.split(/\s+/)[0] || displayName;

  return (
    /* pb-[calc(5.5rem+env(safe-area-inset-bottom))] clears the resident
       BottomTabBar (h-16 ≈ 4rem) + safe-area on mobile; pb-10 on desktop. */
    <div className="mx-auto w-full max-w-7xl px-4 pt-20 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-24 sm:pb-10 lg:px-8">
      <section className="mb-6 sm:mb-8">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#30d158] shadow-[0_0_6px_rgba(48,209,88,0.6)]"
            aria-hidden="true"
          />
          My Reports
        </p>
        <h1 className="mt-2 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
          Your reports, {firstName}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Every issue you&apos;ve flagged, and how the city is moving on it.
        </p>
      </section>

      <MyReportsInteractive reports={reports} />
    </div>
  );
}

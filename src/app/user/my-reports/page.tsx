import type { Metadata } from "next";
import { MyReportsInteractive } from "@/components/resident/my-reports-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { getCurrentResident, getMyReports } from "@/lib/resident-data";

export async function generateMetadata(): Promise<Metadata> {
  const name = KNOWN_CITIES.cumming.name;
  return {
    title: `Civic | ${name} — My Reports`,
    description: `Track the community's reported issues in ${name} — status, progress, and resolution.`,
  };
}

export default async function MyReportsPage() {
  const { citySlug } = await getCurrentResident();
  const reports = await getMyReports(citySlug);
  const cityName = KNOWN_CITIES[citySlug]?.name ?? KNOWN_CITIES.cumming.name;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-4 md:pb-10">
      <section className="mb-6">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          My Reports
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          {cityName}&apos;s community reports
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Everything the community has flagged, and where each one stands. Tap a
          report to see its full timeline.
        </p>
      </section>

      <MyReportsInteractive reports={reports} />
    </div>
  );
}

import type { Metadata } from "next";
import { MyReportsInteractive } from "@/components/resident/my-reports-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { getCurrentResident, getMyReports } from "@/lib/resident-data";

export async function generateMetadata(): Promise<Metadata> {
  const name = KNOWN_CITIES.cumming.name;
  return {
    title: `Civic | ${name} — My Reports`,
    description: `Track the issues you've reported in ${name} — status, progress, and resolution.`,
  };
}

export default async function MyReportsPage() {
  const { citySlug, displayName } = await getCurrentResident();
  const reports = await getMyReports(citySlug);

  // First name only — friendlier in the hero, and the demo display name is a
  // generic "Cumming Resident" so the split degrades gracefully.
  const firstName = displayName.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10">
      <section className="mb-6">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          My Reports
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          {firstName}&apos;s reports
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Everything you&apos;ve flagged, and where each one stands. Tap a
          report to see its full timeline.
        </p>
      </section>

      <MyReportsInteractive reports={reports} />
    </div>
  );
}

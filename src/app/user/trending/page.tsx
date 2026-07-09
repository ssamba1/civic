import type { Metadata } from "next";
import { TrendingFeed } from "@/components/resident/trending-feed";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { getCurrentResident } from "@/lib/resident-data";

export function generateMetadata(): Metadata {
  const name = KNOWN_CITIES.cumming.name;
  return {
    title: `Civic | ${name} — Trending Issues`,
    description: `The open issues ${name} residents are upvoting most right now.`,
  };
}

export default async function TrendingPage() {
  const { citySlug } = await getCurrentResident();
  const name = KNOWN_CITIES[citySlug]?.name ?? KNOWN_CITIES.cumming.name;

  // Only unresolved issues belong in a demand feed — a fixed report has no
  // pressure left to apply.
  const open = getReportCorpus().filter(
    (r) => r.status !== "closed" && r.status !== "rejected",
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-4 md:pb-10 lg:px-6">
      <section className="mb-8">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          Trending
        </p>
        <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          What {name} wants fixed most
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Open issues ranked by how many neighbors upvoted them. Add your voice
          — the top of this list is where the pressure is.
        </p>
      </section>

      <TrendingFeed reports={open} />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTrending } from "@/components/resident/public-trending";
import {
  type DashboardReport,
  getReportCorpus,
  KNOWN_CITIES,
} from "@/lib/dashboard-data";
import { rankTrending } from "@/lib/trending";

/** Deterministic demo upvote count, mirrors baseUpvoteCount from upvotes.ts.
 *  Duplicated here to avoid importing the "use client" upvotes module in a
 *  server component. See INTEGRATION-NOTES-lane2.md for live-deploy wiring. */
function demoUpvoteCount(reportId: string, severity = 3): number {
  let hash = 0;
  for (let i = 0; i < reportId.length; i++) {
    hash = reportId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (Math.abs(hash) % 24) + severity * 2;
}

/* ==================================================================
   Public trending-issues page (NEXT_100 #86), no auth required.

   Ranking: server-side rankTrending() scores reports by upvotes ×
   recency decay (see src/lib/trending.ts). In demo mode upvotes come
   from the deterministic baseUpvoteCount. On a live deploy the caller
   would enrich with real counts from the report_upvote_counts RPC;
   graceful degradation = 0 upvotes still shows a recency-sorted list.
   ================================================================== */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = KNOWN_CITIES[slug];
  const name = city?.name ?? slug;
  return {
    title: `Civic | ${name}, Trending Issues`,
    description: `The open issues ${name} residents are upvoting most right now. No account needed.`,
    // Public feed, allow indexing
    robots: { index: true, follow: true },
  };
}

export default async function PublicTrendingPage({ params }: PageProps) {
  const { slug } = await params;

  // Graceful: unknown slug → 404
  const known = KNOWN_CITIES[slug];
  if (!known) {
    // Also try live DB lookup for provisioned cities
    let cityOk = false;
    try {
      const { fetchCity: fetchCityFromDb } = await import(
        "@/lib/dashboard-queries"
      );
      const city = await fetchCityFromDb(slug);
      cityOk = city != null;
    } catch {
      // DB not available, graceful fallback
    }
    if (!cityOk) notFound();
  }

  const name = known?.name ?? slug;

  // Filter to open-only (closed issues have no actionable pressure)
  const open: DashboardReport[] = getReportCorpus().filter(
    (r) => r.status !== "closed" && r.status !== "rejected",
  );

  // Attach upvote counts. Demo: deterministic hash. Live deploy: replace
  // with report_upvote_counts RPC batch (see INTEGRATION-NOTES-lane2.md).
  const enriched = open.map((r) => ({
    ...r,
    upvotes: demoUpvoteCount(r.id, r.severity),
  }));

  const ranked = rankTrending(enriched).slice(0, 25);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-3 py-16 sm:px-4 lg:px-6">
        {/* Header */}
        <section className="mb-8">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
              aria-hidden="true"
            />
            Trending · {name}
          </p>
          <h1 className="mt-2 text-[34px] sm:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
            What {name} wants fixed most
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Open issues ranked by how many neighbors upvoted them, updated in
            real time. No account needed to view this list.
          </p>
        </section>

        <PublicTrending reports={ranked} />

        <p className="mt-8 text-[12px] text-faint">
          Powered by{" "}
          <a
            href="/"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Civic
          </a>{" "}
          · Open311 compatible · Public data
        </p>
      </div>
    </main>
  );
}

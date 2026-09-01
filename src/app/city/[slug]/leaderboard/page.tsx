import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { corpusForCity } from "@/lib/analytics/corpus-for-city";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Response-time leaderboard by category (NEXT_100 #41).

   Internal accountability: which categories the city clears fastest and where
   the backlog is aging. Computed from the city's corpus — resolution rate +
   average age of what's still open, ranked so the laggards surface.
   ================================================================== */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = await corpusForCity(slug);
  return { title: c ? `Civic | ${c.name} — Leaderboard` : "Civic" };
}

const DAY = 86_400_000;

export default async function LeaderboardPage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await corpusForCity(slug);
  if (!resolved) notFound();

  const now = Date.now();
  const agg = new Map<
    ReportCategory,
    { total: number; closed: number; openAgeSum: number; openCount: number }
  >();
  for (const r of resolved.corpus) {
    const a = agg.get(r.category) ?? {
      total: 0,
      closed: 0,
      openAgeSum: 0,
      openCount: 0,
    };
    a.total++;
    if (r.status === "closed") a.closed++;
    else if (r.status !== "rejected") {
      a.openCount++;
      a.openAgeSum += (now - Date.parse(r.created_at)) / DAY;
    }
    agg.set(r.category, a);
  }

  const rows = [...agg.entries()]
    .map(([category, a]) => ({
      category,
      total: a.total,
      resolutionRate: a.total > 0 ? Math.round((a.closed / a.total) * 100) : 0,
      avgOpenAge: a.openCount > 0 ? Math.round(a.openAgeSum / a.openCount) : 0,
    }))
    .sort(
      (x, y) =>
        y.resolutionRate - x.resolutionRate || x.avgOpenAge - y.avgOpenAge,
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-city-content pb-10 sm:px-4">
      <section className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight">
          Category leaderboard
        </h1>
        <p className="text-[13px] text-faint">
          Resolution rate and average age of open reports, by category.
        </p>
      </section>

      <ol data-tour="leaderboard-list" className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const meta = CATEGORY_META[row.category] ?? CATEGORY_META.other;
          return (
            <li
              key={row.category}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-3"
            >
              <span className="w-6 text-center text-[15px] font-semibold tabular-nums text-faint">
                {i + 1}
              </span>
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden="true"
              />
              <span className="flex-1 text-[14px] font-medium">
                {meta.label}
              </span>
              <span className="w-24 text-right text-[13px] tabular-nums">
                {row.resolutionRate}% closed
              </span>
              <span className="w-28 text-right text-[13px] tabular-nums text-subtle">
                {row.avgOpenAge}d avg open
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { corpusForCity } from "@/lib/analytics/corpus-for-city";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Repeat-offender asset registry (NEXT_100 #48).

   Infrastructure that keeps failing — the same location generating report after
   report. Groups the corpus by address and surfaces locations with repeat
   reports so staff can fix the root cause instead of the symptom.
   ================================================================== */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = await corpusForCity(slug);
  return { title: c ? `Civic | ${c.name} — Repeat Hotspots` : "Civic" };
}

interface Hotspot {
  address: string;
  count: number;
  open: number;
  categories: Set<ReportCategory>;
  lastAt: string;
  times: number[];
}

/** Predicted next occurrence (#45): last report + average gap between the
 *  location's past reports. Needs >=3 reports (>=2 gaps) to be meaningful. */
function predictedNext(h: Hotspot): string | null {
  if (h.times.length < 3) return null;
  const sorted = [...h.times].sort((a, b) => a - b);
  let gapSum = 0;
  for (let i = 1; i < sorted.length; i++) gapSum += sorted[i] - sorted[i - 1];
  const avgGap = gapSum / (sorted.length - 1);
  return new Date(Date.parse(h.lastAt) + avgGap).toISOString();
}

export default async function HotspotsPage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await corpusForCity(slug);
  if (!resolved) notFound();

  const byAddress = new Map<string, Hotspot>();
  for (const r of resolved.corpus) {
    const key = (r.address ?? "").trim().toLowerCase();
    if (!key) continue;
    const h = byAddress.get(key) ?? {
      address: r.address ?? "",
      count: 0,
      open: 0,
      categories: new Set<ReportCategory>(),
      lastAt: r.created_at,
      times: [],
    };
    h.count++;
    if (r.status !== "closed" && r.status !== "rejected") h.open++;
    h.categories.add(r.category);
    h.times.push(Date.parse(r.created_at));
    if (Date.parse(r.created_at) > Date.parse(h.lastAt))
      h.lastAt = r.created_at;
    byAddress.set(key, h);
  }

  const hotspots = [...byAddress.values()]
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.count - a.count || b.open - a.open)
    .slice(0, 50);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-city-content pb-10 sm:px-4">
      <section className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight">
          Repeat hotspots
        </h1>
        <p className="text-[13px] text-faint">
          Locations with 2+ reports — recurring failures worth a root-cause fix.
        </p>
      </section>

      {hotspots.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-center text-[14px] text-faint">
          No repeat locations yet.
        </p>
      ) : (
        <ol data-tour="hotspots-list" className="flex flex-col gap-2">
          {hotspots.map((h) => (
            <li
              key={h.address}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] font-medium">
                  {h.address}
                </span>
                <span className="flex-shrink-0 rounded-md bg-overlay px-2 py-0.5 text-[12px] font-semibold tabular-nums">
                  {h.count} reports · {h.open} open
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[...h.categories].map((cat) => {
                  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
                  return (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 text-[12px] text-subtle"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden="true"
                      />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
              {(() => {
                const next = predictedNext(h);
                if (!next) return null;
                return (
                  <p className="mt-1.5 text-[12px] text-[var(--status-warning-fg)]">
                    Likely to recur around{" "}
                    {new Date(next).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    at the current cadence.
                  </p>
                );
              })()}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

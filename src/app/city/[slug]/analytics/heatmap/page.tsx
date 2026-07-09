import type { Metadata } from "next";
import { notFound } from "next/navigation";
// Client wrapper does the ssr:false dynamic import — not allowed here (server).
import { DensityHeatmapLoader as DensityHeatmap } from "@/components/analytics/density-heatmap-loader";
import {
  bucketByGrid,
  computeBounds,
  toHeatmapPoints,
} from "@/lib/analytics/heatmap";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCorpus } from "@/lib/dashboard-queries";

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
  return {
    title: `Civic | ${city.name}, ${city.state} — Density Heatmap`,
    description: `Geographic density of civic repair reports in ${city.name}, ${city.state}. Weighted by severity and recency.`,
  };
}

export default async function HeatmapPage({ params }: PageProps) {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) notFound();

  // Fetch the full corpus (gracefully returns [] on DB absence — see safeQuery).
  const reports = await fetchCorpus(city.id, ["resident"], 10_000);

  const points = toHeatmapPoints(reports);
  const bounds = computeBounds(points);

  // Pre-compute grid cells server-side so we can show a server-rendered summary
  // without waiting for the client bundle.
  const topCells = bucketByGrid(points, 0.01)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Report Density Heatmap
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Geographic concentration of civic issues in{" "}
            <span className="font-medium text-foreground">
              {city.name}, {city.state}
            </span>
            . Weight = severity × recency (90-day exponential decay).
          </p>
        </div>

        {/* Stats row */}
        <div className="mb-4 flex flex-wrap gap-4">
          <StatCard
            label="Total reports"
            value={reports.length.toLocaleString()}
          />
          <StatCard
            label="Weighted points"
            value={points.length.toLocaleString()}
          />
          {topCells[0] && (
            <StatCard
              label="Hottest cell (reports)"
              value={topCells[0].count.toString()}
            />
          )}
        </div>

        {/* Map — full height client component */}
        <div className="h-[60vh] min-h-[400px] w-full">
          <DensityHeatmap points={points} bounds={bounds} />
        </div>

        {/* Top hotspot table (server-rendered, no JS) */}
        {topCells.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top hotspot grid cells (0.01° ≈ 1 km)
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Rank
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Lat, Lng
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Reports
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                      Avg severity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topCells.map((cell, i) => (
                    <tr
                      key={`${cell.position[0]}-${cell.position[1]}`}
                      className="bg-card"
                    >
                      <td className="px-4 py-2 text-muted-foreground">
                        #{i + 1}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {cell.position[1].toFixed(4)},{" "}
                        {cell.position[0].toFixed(4)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {cell.count}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {cell.avgSeverity}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

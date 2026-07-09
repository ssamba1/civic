import { LandPlot } from "lucide-react";
import { createServerClient } from "@/lib/db/client";
import { fetchDistrictRollups } from "@/lib/db/districts";

export const dynamic = "force-dynamic";
export const metadata = { title: "District rollups | Civic" };

function fmtHours(h: number): string {
  if (h <= 0) return "—";
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default async function AdminDistrictsPage() {
  const db = createServerClient();
  const { data: cities } = await db
    .from("cities")
    .select("id, name")
    .order("name");

  const perCity = await Promise.all(
    (cities ?? []).map(async (c) => ({
      city: c,
      rollups: await fetchDistrictRollups(c.id),
    })),
  );
  const withDistricts = perCity.filter((x) => x.rollups.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <LandPlot className="h-6 w-6 text-subtle" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            District rollups
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Per-council-district report stats — each member&apos;s turf report.
            Reports are matched to a district by point-in-polygon.
          </p>
        </div>
      </div>

      {withDistricts.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-sm text-subtle">
          No council districts seeded yet. Add rows to{" "}
          <code>council_districts</code> (name, rep_name, boundary polygon) for
          a city and its turf report appears here.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {withDistricts.map(({ city, rollups }) => (
            <section key={city.id}>
              <h2 className="mb-2 text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
                {city.name}
              </h2>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline">
                <table className="w-full text-sm">
                  <thead className="bg-overlay text-left text-[12px] uppercase tracking-wide text-faint">
                    <tr>
                      <th className="px-4 py-2 font-medium">District</th>
                      <th className="px-4 py-2 font-medium">Council member</th>
                      <th className="px-4 py-2 font-medium">Reports</th>
                      <th className="px-4 py-2 font-medium">Open</th>
                      <th className="px-4 py-2 font-medium">Resolved</th>
                      <th className="px-4 py-2 font-medium">Avg resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollups.map((d) => (
                      <tr
                        key={d.districtId}
                        className="border-t border-hairline"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {d.name}
                        </td>
                        <td className="px-4 py-3 text-subtle">
                          {d.repName ?? "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-subtle">
                          {d.total.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-warning)]">
                          {d.openCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-success)]">
                          {d.closed.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-subtle">
                          {fmtHours(d.avgResolutionHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

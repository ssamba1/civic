import { getPeerBenchmarks, rankCities } from "@/lib/analytics/benchmarks";
import { cn } from "@/lib/utils/cn";
import { formatHours } from "@/lib/utils/time-ago";

interface Props {
  currentCityId?: string;
}

export async function PeerBenchmarks({ currentCityId }: Props) {
  const rows = await getPeerBenchmarks();

  if (rows.length === 0) {
    return (
      <section
        aria-label="Peer city benchmarks"
        className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
      >
        <h2 className="text-[13px] font-semibold text-foreground mb-1">
          Peer City Benchmarks
        </h2>
        <p className="text-[12px] text-faint">
          No benchmark data available yet.
        </p>
      </section>
    );
  }

  const ranked = rankCities(rows, "avgResolutionHours");

  return (
    <section
      aria-label="Peer city benchmarks"
      className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 className="text-[13px] font-semibold text-foreground">
          Peer City Benchmarks
        </h2>
        <span className="text-[12px] text-faint">
          Ranked by avg resolution time (lower = better)
        </span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-left text-faint">
              <th className="pb-2 pr-3 font-medium w-8 text-center">#</th>
              <th className="pb-2 pr-3 font-medium">City</th>
              <th className="pb-2 pr-3 font-medium text-right">Reports</th>
              <th className="pb-2 pr-3 font-medium text-right">Avg resolution</th>
              <th className="pb-2 font-medium text-right">Close rate</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const isCurrent = r.cityId === currentCityId;
              return (
                <tr
                  key={r.cityId}
                  className={cn(
                    "border-b border-hairline last:border-0",
                    isCurrent && "bg-primary/5 font-medium",
                  )}
                >
                  <td className="py-2 pr-3 text-center text-faint tabular-nums">
                    {r.rank}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        "text-foreground",
                        isCurrent && "text-primary",
                      )}
                    >
                      {r.cityName}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          you
                        </span>
                      )}
                    </span>
                    <span className="ml-1 text-faint">{r.state}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {r.totalReports.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                    {formatHours(r.avgResolutionHours)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {(r.closeRate * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { fetchEquityData } from "@/lib/analytics/equity";
import { cn } from "@/lib/utils/cn";
import { formatHours } from "@/lib/utils/time-ago";

interface Props {
  cityId: string;
}

export async function EquityPanel({ cityId }: Props) {
  const { rows, citywideMedian } = await fetchEquityData(cityId);

  if (rows.length === 0) {
    return (
      <section
        aria-label="Response equity"
        className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
      >
        <h2 className="text-[13px] font-semibold text-foreground mb-1">
          Response Equity
        </h2>
        <p className="text-[12px] text-faint">
          No district data available. Configure council districts to see equity
          analysis.
        </p>
      </section>
    );
  }

  const underservedCount = rows.filter((r) => r.underserved).length;

  return (
    <section
      aria-label="Response equity by council district"
      className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
        <h2 className="text-[13px] font-semibold text-foreground">
          Response Equity
        </h2>
        <span className="text-[12px] text-faint">
          Citywide median:{" "}
          <span className="text-foreground font-medium">
            {formatHours(citywideMedian)}
          </span>
        </span>
        {underservedCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {underservedCount} underserved{" "}
            {underservedCount === 1 ? "district" : "districts"}
          </span>
        )}
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[420px] text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-left text-faint">
              <th className="pb-2 pr-3 font-medium">District</th>
              <th className="pb-2 pr-3 font-medium text-right">Reports</th>
              <th className="pb-2 pr-3 font-medium text-right">
                Avg resolution
              </th>
              <th className="pb-2 font-medium text-right">Open rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.districtId}
                className={cn(
                  "border-b border-hairline last:border-0",
                  r.underserved && "bg-destructive/5",
                )}
              >
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    {r.underserved && (
                      <span
                        role="img"
                        aria-label="underserved"
                        className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0"
                      />
                    )}
                    <span className="font-medium text-foreground">
                      {r.name}
                    </span>
                    {r.repName && (
                      <span className="text-faint truncate max-w-[120px]">
                        {r.repName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                  {r.reportCount.toLocaleString()}
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right tabular-nums font-medium",
                    r.underserved ? "text-destructive" : "text-foreground",
                  )}
                >
                  {formatHours(r.avgResolutionHours)}
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {(r.openRate * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-faint">
        Underserved = avg resolution &gt; 1.5× citywide median. Sorted by
        resolution time, underserved first.
      </p>
    </section>
  );
}

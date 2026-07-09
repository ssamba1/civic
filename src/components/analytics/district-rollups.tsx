import { fetchDistrictRollups } from "@/lib/db/districts";
import { formatHours } from "@/lib/utils/time-ago";

interface Props {
  cityId: string;
}

export async function DistrictRollups({ cityId }: Props) {
  const rollups = await fetchDistrictRollups(cityId);

  if (rollups.length === 0) {
    return (
      <section
        aria-label="Council district rollups"
        className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
      >
        <h2 className="text-[13px] font-semibold text-foreground mb-1">
          Council Districts
        </h2>
        <p className="text-[12px] text-faint">No districts configured.</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Council district rollups"
      className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5"
    >
      <h2 className="text-[13px] font-semibold text-foreground mb-4">
        Council Districts
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rollups.map((d) => {
          const closedPct =
            d.total === 0 ? 0 : Math.round((d.closed / d.total) * 100);
          return (
            <article
              key={d.districtId}
              className="rounded-[var(--radius-md)] border border-hairline bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[12px] font-semibold text-foreground leading-tight">
                    {d.name}
                  </p>
                  {d.repName && (
                    <p className="text-[11px] text-faint mt-0.5 truncate">
                      {d.repName}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] font-medium text-faint">
                  {closedPct}% closed
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[15px] font-semibold text-foreground tabular-nums">
                    {d.total.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-faint">Total</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-amber-500 tabular-nums">
                    {d.openCount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-faint">Open</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-green-500 tabular-nums">
                    {d.closed.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-faint">Closed</p>
                </div>
              </div>

              {d.avgResolutionHours > 0 && (
                <p className="mt-2 text-[11px] text-faint text-center">
                  Avg resolution:{" "}
                  <span className="text-foreground font-medium">
                    {formatHours(d.avgResolutionHours)}
                  </span>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

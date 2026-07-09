import { getPeerBenchmark } from "@/lib/analytics/peer-benchmark";

/* ==================================================================
   Peer-city benchmark card (NEXT_100 #40).

   "You resolve reports faster than X% of comparable cities." Sells itself to a
   city manager — no incumbent shows cross-city comparison. Server component:
   fetches the anonymized RPC and renders, or nothing when there's no peer data.
   ================================================================== */

export async function PeerBenchmarkCard({ cityId }: { cityId: string }) {
  const b = await getPeerBenchmark(cityId);
  if (!b) return null;

  const beats = b.percentile;
  const vsPeer =
    b.resolution_rate != null && b.peer_median_resolution != null
      ? Math.round(b.resolution_rate - b.peer_median_resolution)
      : null;

  return (
    <section className="mb-4 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
            Peer benchmark
          </h2>
          <p className="mt-1 text-[15px] font-semibold text-foreground">
            {beats >= 50
              ? `Resolving faster than ${beats}% of comparable cities`
              : `Ranked #${b.rank} of ${b.total_cities} comparable cities`}
          </p>
          {vsPeer != null && (
            <p className="mt-0.5 text-[13px] text-subtle">
              {vsPeer >= 0
                ? `${vsPeer} points above`
                : `${Math.abs(vsPeer)} points below`}{" "}
              the peer median resolution rate.
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[32px] font-semibold tabular-nums text-foreground">
            {b.resolution_rate ?? "—"}
          </span>
          <span className="text-[15px] text-faint">% resolved</span>
        </div>
      </div>
    </section>
  );
}

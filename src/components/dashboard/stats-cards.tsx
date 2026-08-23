import { TrendingDown, TrendingUp } from "lucide-react";
import { memo } from "react";
import type { CityStats } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";
import { formatHours } from "@/lib/utils/time-ago";

interface StatsCardsProps {
  stats: CityStats;
}

interface CardDef {
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string; tone: "good" | "bad" };
}

// Per-index divider classes: 2-col mobile grid → 4-col desktop row.
// Cells share one hairline-bordered surface; dividers, not gaps.
const BORDER_CLASSES = [
  "border-r border-b lg:border-b-0 border-hairline",
  "border-b lg:border-b-0 lg:border-r border-hairline",
  "border-r border-hairline",
  "",
];

function StatsCardsInner({ stats }: StatsCardsProps) {
  const weekDelta = stats.this_week - stats.prev_week;
  const weekPct =
    stats.prev_week > 0
      ? Math.round((Math.abs(weekDelta) / stats.prev_week) * 100)
      : 0;

  // Per-metric trend semantics: an "up" arrow is not universally bad. For
  // intake volume more reports rising just signals activity (neutral-bad at
  // worst), for backlog up=bad, for throughput up=good, for time-to-resolve
  // up=bad. Color encodes good/bad, the arrow encodes direction.
  const weekTrend: CardDef["trend"] =
    stats.prev_week > 0 && weekDelta !== 0
      ? {
          direction: weekDelta > 0 ? "up" : "down",
          label: `${weekPct}%`,
          // Rising intake means more unresolved demand on the city: bad.
          tone: weekDelta > 0 ? "bad" : "good",
        }
      : undefined;

  const cards: CardDef[] = [
    {
      label: "Total reports",
      value: stats.total.toLocaleString(),
      trend: weekTrend,
    },
    {
      label: "Open",
      value: stats.open.toLocaleString(),
    },
    {
      label: "Resolved",
      value: stats.resolved.toLocaleString(),
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avg_resolution_hours),
    },
  ];

  return (
    <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface overflow-hidden shadow-[var(--shadow-card)]">
      <style>{`
@keyframes stat-roll{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.stat-val{animation:stat-roll 260ms cubic-bezier(0.22,1,0.36,1) both}
@media (prefers-reduced-motion:reduce){.stat-val{animation:none}}
`}</style>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {cards.map((card, idx) => (
          <div
            key={card.label}
            className={cn(
              "px-4 py-4 sm:px-5 sm:py-5 min-h-[80px] transition-colors hover:bg-overlay",
              BORDER_CLASSES[idx],
            )}
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              {/* Mono micro-label convention for stat captions. */}
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint leading-none">
                {card.label}
              </span>
              {card.trend && (
                <span
                  // role="img" so the aria-label (generic role drops it) is
                  // honored and replaces the raw "12%" text with the full
                  // "Up 12% versus last week" phrase for screen readers.
                  role="img"
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    // Pastel delta chip: soft fill carries the tone, strong
                    // variant carries the (AA-tuned) figure. Tone, not arrow
                    // direction, picks the pair.
                    card.trend.tone === "good"
                      ? "bg-pastel-mint text-pastel-mint-strong"
                      : "bg-pastel-blush text-pastel-blush-strong",
                  )}
                  aria-label={`${card.trend.direction === "up" ? "Up" : "Down"} ${card.trend.label} versus last week`}
                >
                  {card.trend.direction === "up" ? (
                    <TrendingUp
                      className="h-3 w-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <TrendingDown
                      className="h-3 w-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  {card.trend.label}
                </span>
              )}
            </div>
            <p
              // key on the value re-mounts the node when the number changes,
              // re-firing the brief rise animation; static between filter swaps.
              key={card.value}
              className="stat-val text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground"
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const StatsCards = memo(StatsCardsInner);

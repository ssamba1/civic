import { TrendingDown, TrendingUp } from "lucide-react";
import { memo } from "react";
import type { CityStats } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";

interface StatsCardsProps {
  stats: CityStats;
}

interface CardDef {
  label: string;
  value: string;
  accent: string;
  trend?: { direction: "up" | "down"; label: string; tone: "good" | "bad" };
}

// 2-col mobile grid → 4-col desktop row. Hairline dividers between cells.
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
      accent: "#0a84ff",
      trend: weekTrend,
    },
    {
      label: "Open",
      value: stats.open.toLocaleString(),
      accent: "#ff9f0a",
    },
    {
      label: "Resolved",
      value: stats.resolved.toLocaleString(),
      accent: "#30d158",
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avg_resolution_hours),
      accent: "#5ac8fa",
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-[var(--shadow-card)]">
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
              "px-4 py-4 sm:px-5 sm:py-5 transition-colors hover:bg-overlay",
              BORDER_CLASSES[idx],
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint leading-none">
                {card.label}
              </span>
              {card.trend && (
                <span
                  // role="img" so the aria-label (generic role drops it) is
                  // honored and replaces the raw "12%" text with the full
                  // "Up 12% versus last week" phrase for screen readers.
                  role="img"
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                    card.trend.tone === "bad"
                      ? "text-[#ff453a]"
                      : "text-[#30d158]",
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
              className="stat-val text-[26px] sm:text-[30px] font-semibold tracking-tight tabular-nums leading-none"
              style={{ color: `${card.accent}cc` }}
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

function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

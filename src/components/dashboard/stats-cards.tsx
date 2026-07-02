import {
  CheckCircle2,
  Clock,
  FileText,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
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
  icon: typeof FileText;
  trend?: { direction: "up" | "down"; label: string; tone: "good" | "bad" };
}

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
      icon: FileText,
      trend: weekTrend,
    },
    {
      label: "Open",
      value: stats.open.toLocaleString(),
      icon: TriangleAlert,
    },
    {
      label: "Resolved",
      value: stats.resolved.toLocaleString(),
      icon: CheckCircle2,
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avg_resolution_hours),
      icon: Clock,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <style>{`
@keyframes stat-roll{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.stat-val{animation:stat-roll 260ms cubic-bezier(0.22,1,0.36,1) both}
@media (prefers-reduced-motion:reduce){.stat-val{animation:none}}
`}</style>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:border-hairline-strong sm:p-5"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-overlay text-subtle">
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[13px] text-subtle">{card.label}</span>
            </div>
            <p
              // key on the value re-mounts the node when the number changes,
              // re-firing the brief rise animation; static between filter swaps.
              key={card.value}
              className="stat-val text-2xl font-semibold tracking-tight tabular-nums leading-none text-foreground"
            >
              {card.value}
            </p>
            {card.trend && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <span className="text-[12px] text-faint">vs last week</span>
                <span
                  // role="img" so the aria-label (generic role drops it) is
                  // honored and replaces the raw "12%" text with the full
                  // "Up 12% versus last week" phrase for screen readers.
                  role="img"
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    card.trend.tone === "bad"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                      : "bg-accent-soft text-accent-text",
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const StatsCards = memo(StatsCardsInner);

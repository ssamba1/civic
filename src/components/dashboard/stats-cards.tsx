import { memo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { CityStats } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";

interface StatsCardsProps {
  stats: CityStats;
}

interface CardDef {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: { direction: "up" | "down"; label: string };
}

function StatsCardsInner({ stats }: StatsCardsProps) {
  const weekDelta = stats.this_week - stats.prev_week;
  const weekPct =
    stats.prev_week > 0
      ? Math.round((Math.abs(weekDelta) / stats.prev_week) * 100)
      : 0;

  const cards: CardDef[] = [
    {
      label: "Total reports",
      value: stats.total.toLocaleString(),
      icon: <FileText className="h-4 w-4" strokeWidth={1.75} />,
      trend:
        weekDelta !== 0
          ? {
              direction: weekDelta > 0 ? "up" : "down",
              label: `${weekPct}%`,
            }
          : undefined,
    },
    {
      label: "Open",
      value: stats.open.toLocaleString(),
      icon: <AlertCircle className="h-4 w-4" strokeWidth={1.75} />,
    },
    {
      label: "Resolved",
      value: stats.resolved.toLocaleString(),
      icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />,
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avg_resolution_hours),
      icon: <Clock className="h-4 w-4" strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-xl bg-[#1c1c1e] border border-white/[0.06] p-5 transition-colors hover:border-white/[0.12]"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center text-zinc-500">
              {card.icon}
            </span>
            {card.trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[12px]",
                  card.trend.direction === "up"
                    ? "text-[#ff453a]"
                    : "text-[#30d158]",
                )}
              >
                {card.trend.direction === "up" ? (
                  <TrendingUp className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <TrendingDown className="h-3 w-3" strokeWidth={2} />
                )}
                {card.trend.label}
              </span>
            )}
          </div>

          <p className="mt-4 text-[28px] font-semibold tracking-tight text-white leading-none">
            {card.value}
          </p>
          <p className="text-[13px] text-zinc-500 mt-2">{card.label}</p>
        </article>
      ))}
    </div>
  );
}

export const StatsCards = memo(StatsCardsInner);

function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

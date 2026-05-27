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
  color: string;
  trend?: { direction: "up" | "down"; label: string };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const weekDelta = stats.this_week - stats.prev_week;
  const weekPct =
    stats.prev_week > 0
      ? Math.round((Math.abs(weekDelta) / stats.prev_week) * 100)
      : 0;

  const cards: CardDef[] = [
    {
      label: "Total Reports",
      value: stats.total.toLocaleString(),
      icon: <FileText className="h-5 w-5" />,
      color: "text-blue-600 bg-blue-50",
      trend:
        weekDelta !== 0
          ? {
              direction: weekDelta > 0 ? "up" : "down",
              label: `${weekPct}% this week`,
            }
          : undefined,
    },
    {
      label: "Open",
      value: stats.open.toLocaleString(),
      icon: <AlertCircle className="h-5 w-5" />,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Resolved",
      value: stats.resolved.toLocaleString(),
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Avg Resolution",
      value: formatHours(stats.avg_resolution_hours),
      icon: <Clock className="h-5 w-5" />,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-lg p-2",
                card.color,
              )}
            >
              {card.icon}
            </span>
            {card.trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  card.trend.direction === "up"
                    ? "text-rose-600"
                    : "text-green-600",
                )}
              >
                {card.trend.direction === "up" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {card.trend.label}
              </span>
            )}
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
            {card.value}
          </p>
          <p className="text-sm text-zinc-500">{card.label}</p>
        </article>
      ))}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}

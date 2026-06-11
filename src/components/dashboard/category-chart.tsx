"use client";

import { memo } from "react";
import type { CategoryCount } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";
import { BarChart2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface CategoryChartProps {
  data: CategoryCount[];
  selectedCategory?: ReportCategory | null;
  onSelectCategory?: (category: ReportCategory | null) => void;
}

function CategoryChartInner({
  data,
  selectedCategory = null,
  onSelectCategory,
}: CategoryChartProps) {
  // Don't assume `data` is sorted, and never let an all-zero dataset divide by
  // zero in the bar-width math below.
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  const panelClass =
    "rounded-xl bg-[#1c1c1e] border border-white/[0.06]";

  if (data.length === 0) {
    return (
      <div className={`${panelClass} p-5`}>
        <h2 className="text-[15px] font-semibold text-white">Categories</h2>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <BarChart2
            className="h-8 w-8 text-zinc-700"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="mt-3 text-sm text-zinc-400">No data yet.</p>
          <p className="mt-1 text-[13px] text-zinc-500">Try adjusting filters.</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`${panelClass} p-4 sm:p-5 flex flex-col h-full max-h-[60vh] sm:max-h-[480px]`}
    >
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <h2 className="text-[15px] font-semibold text-white">Categories</h2>
        {selectedCategory && onSelectCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 min-h-11 text-[13px] text-zinc-400 hover:text-white transition-colors"
          >
            <X className="h-3 w-3" strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1 mt-3">
        {data.map(({ category, count }) => {
          const meta = CATEGORY_META[category];
          const pct = Math.round((count / maxCount) * 100);

          const isSelected = selectedCategory === category;
          const isAnySelected = selectedCategory !== null;
          const isDimmed = isAnySelected && !isSelected;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onSelectCategory?.(category)}
              aria-pressed={isSelected}
              className={cn(
                "w-full text-left px-2 py-2.5 sm:py-2 min-h-11 rounded-md transition-[background-color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1e]",
                isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                isDimmed ? "opacity-40" : "opacity-100",
              )}
            >
              <div className="flex items-center justify-between text-[13px]">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 truncate",
                    isSelected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden
                  />
                  <span className="truncate">{meta.label}</span>
                </span>
                <span className="tabular-nums text-zinc-500 flex-shrink-0 pl-2">
                  {count}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: meta.color,
                    // Full strength when this bar is the active selection or
                    // nothing is selected; muted when another row is focused.
                    opacity: isDimmed ? 0.55 : isSelected ? 1 : 0.85,
                  }}
                  role="meter"
                  aria-valuenow={count}
                  aria-valuemin={0}
                  aria-valuemax={maxCount}
                  aria-label={`${meta.label}: ${count} reports`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export const CategoryChart = memo(CategoryChartInner);

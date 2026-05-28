"use client";

import { memo } from "react";
import type { CategoryCount } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ReportCategory } from "@/lib/types";
import { X } from "lucide-react";
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
  const maxCount = data.length > 0 ? data[0].count : 1;

  const panelClass =
    "rounded-xl bg-[#1c1c1e] border border-white/[0.06]";

  if (data.length === 0) {
    return (
      <div className={`${panelClass} p-5`}>
        <h2 className="text-[15px] font-semibold text-white">Categories</h2>
        <p className="mt-3 text-sm text-zinc-400">No data yet.</p>
      </div>
    );
  }

  return (
    <section
      className={`${panelClass} p-5 flex flex-col h-full max-h-[480px]`}
    >
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <h2 className="text-[15px] font-semibold text-white">Categories</h2>
        {selectedCategory && onSelectCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] text-zinc-400 hover:text-white transition-colors"
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
              onClick={() => onSelectCategory?.(category)}
              className={cn(
                "w-full text-left px-2 py-2 rounded-md transition-colors outline-none cursor-pointer",
                isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                isDimmed ? "opacity-40" : "opacity-100",
              )}
            >
              <div className="flex items-center justify-between text-[13px]">
                <span
                  className={cn(
                    isSelected ? "text-white" : "text-zinc-300",
                  )}
                >
                  {meta.label}
                </span>
                <span className="tabular-nums text-zinc-500">{count}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    opacity: isSelected ? 0.95 : 0.35,
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

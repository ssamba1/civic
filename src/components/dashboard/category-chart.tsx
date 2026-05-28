"use client";

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

export function CategoryChart({
  data,
  selectedCategory = null,
  onSelectCategory,
}: CategoryChartProps) {
  const maxCount = data.length > 0 ? data[0].count : 1;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">
          Reports by Category
        </h2>
        <p className="mt-4 text-sm text-zinc-500">No data yet.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          Reports by Category
        </h2>
        {/* Clear Filter Badge */}
        {selectedCategory && onSelectCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <X className="h-3 w-3" />
            Clear Filter
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-400 mt-1 mb-4">
        {selectedCategory ? "Filtered view active" : "Click any row to filter map & list"}
      </p>

      <div className="space-y-3 overflow-y-auto pr-1 flex-1">
        {data.map(({ category, count }) => {
          const meta = CATEGORY_META[category];
          const pct = Math.round((count / maxCount) * 100);
          
          const isSelected = selectedCategory === category;
          const isAnySelected = selectedCategory !== null;
          const isDimmed = isAnySelected && !isSelected;

          return (
            <button
              key={category}
              onClick={() => onSelectCategory && onSelectCategory(category)}
              className={cn(
                "w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all duration-200 border border-transparent outline-none select-none cursor-pointer",
                isSelected 
                  ? "bg-zinc-50 border-zinc-200/60 shadow-inner" 
                  : "hover:bg-zinc-50/50",
                isDimmed ? "opacity-40" : "opacity-100"
              )}
            >
              <div className="flex items-center justify-between text-sm">
                <span className={cn(
                  "font-medium transition-colors",
                  isSelected ? "text-zinc-950 font-bold" : "text-zinc-700 group-hover:text-zinc-950"
                )}>
                  {meta.label}
                </span>
                <span className={cn(
                  "tabular-nums text-xs transition-colors",
                  isSelected ? "text-zinc-950 font-bold font-mono" : "text-zinc-500"
                )}>
                  {count} reports
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-100/80 border border-zinc-100/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isSelected ? "animate-pulse shadow-md" : ""
                  )}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: meta.color,
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

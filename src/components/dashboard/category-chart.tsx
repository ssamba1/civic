import type { CategoryCount } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";

interface CategoryChartProps {
  data: CategoryCount[];
}

export function CategoryChart({ data }: CategoryChartProps) {
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
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">
        Reports by Category
      </h2>
      <div className="mt-5 space-y-3">
        {data.map(({ category, count }) => {
          const meta = CATEGORY_META[category];
          const pct = Math.round((count / maxCount) * 100);

          return (
            <div key={category} className="group">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">{meta.label}</span>
                <span className="tabular-nums text-zinc-500">{count}</span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
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
            </div>
          );
        })}
      </div>
    </section>
  );
}

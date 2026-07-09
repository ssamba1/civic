import { categoryLabel } from "@/lib/onboarding/presets";
import type { ReportCategory } from "@/lib/types";

interface CrewPortalHeaderProps {
  crewType: string;
  label: string;
  categories: ReportCategory[];
  /** Resolved `?crew=` instance name — when present it becomes the heading and
   *  the type label drops to a subtitle. Absent → type-level header,
   *  byte-identical to before. */
  crewName?: string;
}

/**
 * Scope banner for a crew-type portal. The page-level, always-visible
 * counterpart to the FilterBar's locked-categories badge
 * (src/components/filters/filter-bar.tsx ~586-598) — a crew signing in
 * should see what they're scoped to immediately, not just a badge tucked
 * inside a filter popover. Staff tokens only, no hardcoded colors.
 */
export function CrewPortalHeader({
  crewType,
  label,
  categories,
  crewName,
}: CrewPortalHeaderProps) {
  return (
    <div
      data-crew-type={crewType}
      className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-4 py-3.5"
    >
      <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
        {crewName ?? `${label} Crew`}
      </h1>
      {crewName && (
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          {label} Crew
        </p>
      )}
      <p className="mt-1 text-[13px] text-subtle">
        This portal shows only {label.toLowerCase()}-relevant reports.
      </p>
      {categories.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center rounded-[10px] border border-hairline bg-overlay px-2 py-0.5 text-[11px] font-medium text-faint"
            >
              {categoryLabel(cat)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

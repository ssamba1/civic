"use client";

import { memo } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { categoryToTeamDefault, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";
import { useCategoryOverrides } from "@/lib/category-overrides";
import { TeamPicker } from "@/components/teams/team-picker";
import { Tile } from "@/components/analytics/bento-primitives";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Default routing matrix. Each row exposes a dropdown so dispatchers
   can re-aim a whole category at a different team (e.g. route every
   "downed_sign" report at Streets & Roads instead of Traffic Eng).

   Mutations flow through `useCategoryOverrides()` → mutates the
   module-level snapshot read by `categoryToTeam`, so the change
   propagates to every consumer (filter, delegation, map) without
   any prop drilling.
   ================================================================== */

function RoutingMatrixInner() {
  const { overrides, setCategoryTeam, clearCategoryTeam } =
    useCategoryOverrides();

  const rows = (Object.keys(CATEGORY_META) as ReportCategory[]).map(
    (category) => {
      const defaultTeam = categoryToTeamDefault(category);
      const override = overrides[category];
      const effectiveTeam: TeamId = override ?? defaultTeam;
      return {
        category,
        meta: CATEGORY_META[category],
        defaultTeam,
        effectiveTeam,
        isOverridden: override !== undefined && override !== defaultTeam,
      };
    },
  );

  const overrideCount = rows.filter((r) => r.isOverridden).length;

  return (
    <Tile
      title="Default routing"
      subtitle={
        overrideCount > 0
          ? `${rows.length} categories · ${overrideCount} customized`
          : `${rows.length} categories`
      }
    >
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {rows.map(
          ({ category, meta, defaultTeam, effectiveTeam, isOverridden }) => (
            <li
              key={category}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-white/[0.03] transition-colors"
            >
              <span className="inline-flex flex-1 min-w-0 items-center gap-2 text-zinc-300">
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: meta.color }}
                  aria-hidden
                />
                <span className="truncate">{meta.label}</span>
              </span>
              <ArrowRight
                className="h-3 w-3 flex-shrink-0 text-zinc-600"
                strokeWidth={2}
                aria-hidden
              />
              <div className="flex flex-shrink-0 items-center justify-end gap-1">
                <TeamPicker
                  currentTeam={effectiveTeam}
                  defaultTeam={defaultTeam}
                  onChange={(teamId) => setCategoryTeam(category, teamId)}
                  align="right"
                  labelMaxWidth={88}
                  menuWidth={220}
                />
                <button
                  type="button"
                  onClick={() => clearCategoryTeam(category)}
                  disabled={!isOverridden}
                  title={
                    isOverridden
                      ? "Revert to default routing"
                      : "Already at default"
                  }
                  aria-label="Reset category to default routing"
                  className={cn(
                    "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors",
                    isOverridden
                      ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                      : "text-zinc-800 cursor-default",
                  )}
                >
                  <RotateCcw className="h-3 w-3" strokeWidth={2} />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </Tile>
  );
}

export const RoutingMatrix = memo(RoutingMatrixInner);

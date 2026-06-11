"use client";

import { ArrowRight, Plus, RotateCcw, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { Tile } from "@/components/analytics/bento-primitives";
import { AddCategoryModal } from "@/components/teams/add-category-modal";
import { TeamPicker } from "@/components/teams/team-picker";
import { useCategoryOverrides } from "@/lib/category-overrides";
import { useCustomCategories } from "@/lib/custom-categories";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { categoryToTeamDefault, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Default routing matrix. Each row exposes a dropdown so dispatchers
   can re-aim a whole category at a different team (e.g. route every
   "downed_sign" report at Streets & Roads instead of Traffic Eng).

   Built-in categories flow through `useCategoryOverrides()`. User-added
   issue types flow through `useCustomCategories()` — a parallel store
   (they can't join the compile-time `ReportCategory` union). Both write
   to module-level snapshots, so changes propagate to every consumer
   without prop drilling.
   ================================================================== */

const li =
  "flex items-center gap-2 rounded-md px-2 py-2 sm:py-1.5 text-[12px] hover:bg-white/[0.03] transition-colors min-h-[44px] sm:min-h-0";

function RoutingMatrixInner() {
  const { overrides, setCategoryTeam, clearCategoryTeam } =
    useCategoryOverrides();
  const {
    categories: custom,
    setCustomCategoryTeam,
    removeCustomCategory,
  } = useCustomCategories();
  const [addOpen, setAddOpen] = useState(false);

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
  const total = rows.length + custom.length;
  const subtitleParts = [`${total} categories`];
  if (overrideCount > 0) subtitleParts.push(`${overrideCount} re-routed`);
  if (custom.length > 0) subtitleParts.push(`${custom.length} custom`);

  return (
    <Tile title="Default routing" subtitle={subtitleParts.join(" · ")}>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {rows.map(
          ({ category, meta, defaultTeam, effectiveTeam, isOverridden }) => (
            <li
              key={category}
              className={cn(
                li,
                isOverridden &&
                  "border-l-2 border-l-[#ff9f0a] bg-[#ff9f0a]/[0.04] pl-1.5",
              )}
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
                    "inline-flex h-11 w-11 sm:h-6 sm:w-6 flex-shrink-0 items-center justify-center rounded transition-colors",
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

        {custom.map((c) => (
          <li key={c.id} className={li}>
            <span className="inline-flex flex-1 min-w-0 items-center gap-2 text-zinc-300">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: c.color }}
                aria-hidden
              />
              <span className="truncate">{c.label}</span>
              <span className="flex-shrink-0 rounded-sm bg-white/[0.06] px-1 text-[9px] uppercase tracking-wider text-zinc-500">
                custom
              </span>
            </span>
            <ArrowRight
              className="h-3 w-3 flex-shrink-0 text-zinc-600"
              strokeWidth={2}
              aria-hidden
            />
            <div className="flex flex-shrink-0 items-center justify-end gap-1">
              <TeamPicker
                currentTeam={c.team}
                defaultTeam="general_admin"
                onChange={(teamId) => setCustomCategoryTeam(c.id, teamId)}
                align="right"
                showOverrideTint={false}
                labelMaxWidth={88}
                menuWidth={220}
              />
              <button
                type="button"
                onClick={() => removeCustomCategory(c.id)}
                title="Remove issue type"
                aria-label={`Remove ${c.label} issue type`}
                className="inline-flex h-11 w-11 sm:h-6 sm:w-6 flex-shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-white/[0.1] px-2 py-2.5 text-[12px] font-medium text-zinc-500",
          "transition-colors hover:border-white/[0.22] hover:bg-white/[0.03] hover:text-zinc-300",
          "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60",
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add issue type
      </button>

      <AddCategoryModal open={addOpen} onClose={() => setAddOpen(false)} />
    </Tile>
  );
}

export const RoutingMatrix = memo(RoutingMatrixInner);

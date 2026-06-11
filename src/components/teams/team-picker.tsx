"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TEAMS, TEAM_LIST, type TeamId } from "@/lib/teams";
import { teamIcon } from "@/components/teams/team-icon";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Shared team-picker dropdown. Used by:
     - Routing matrix: pick the default team for a category
     - Delegation panel: pick a per-report override
   Both surfaces share a single source of truth for the menu chrome,
   keyboard handling, and outside-click dismissal.
   ================================================================== */

interface TeamPickerProps {
  currentTeam: TeamId;
  defaultTeam: TeamId;
  onChange: (teamId: TeamId) => void;
  /** Right-align menu (default). Left-align for narrow containers. */
  align?: "left" | "right";
  /** Highlight the trigger when current ≠ default. */
  showOverrideTint?: boolean;
  /** Width of the menu in px (default 240). */
  menuWidth?: number;
  /** Cap on the trigger label width in px (default 140). */
  labelMaxWidth?: number;
}

export function TeamPicker({
  currentTeam,
  defaultTeam,
  onChange,
  align = "right",
  showOverrideTint = true,
  menuWidth = 240,
  labelMaxWidth = 140,
}: TeamPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const team = TEAMS[currentTeam];
  const Icon = teamIcon(team.icon);
  const isOverridden = showOverrideTint && currentTeam !== defaultTeam;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-11 sm:h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60",
          isOverridden
            ? "border-white/[0.16] bg-white/[0.06] text-white"
            : "border-white/[0.06] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:border-white/[0.1]",
        )}
      >
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded"
          style={{ background: `${team.color}22`, color: team.color }}
        >
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <span
          className="truncate"
          style={{ maxWidth: labelMaxWidth, color: team.color }}
        >
          {team.shortLabel}
        </span>
        <ChevronDown className="h-3 w-3 text-zinc-500" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            width: menuWidth,
            transformOrigin: align === "right" ? "top right" : "top left",
          }}
          className={cn(
            "absolute z-30 mt-1.5 overflow-hidden rounded-lg border border-white/[0.08]",
            "bg-[#1c1c1e] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]",
            "max-w-[min(92vw,240px)]",
            "origin-top animate-[city-pop_120ms_ease-out]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <ul className="max-h-[280px] overflow-y-auto custom-scrollbar py-1">
            {TEAM_LIST.filter((t) => t.id !== "all").map((t) => {
              const isDefault = t.id === defaultTeam;
              const isCurrent = t.id === currentTeam;
              const ItemIcon = teamIcon(t.icon);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-left text-[12px] transition-colors",
                      "outline-none focus-visible:bg-white/[0.06]",
                      isCurrent
                        ? "bg-white/[0.06] text-white"
                        : "text-zinc-300 hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
                      style={{ background: `${t.color}22`, color: t.color }}
                    >
                      <ItemIcon className="h-3 w-3" strokeWidth={2} />
                    </span>
                    <span className="flex-1 truncate">{t.shortLabel}</span>
                    {isDefault && (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        default
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

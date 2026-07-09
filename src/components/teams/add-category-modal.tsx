"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { teamIcon } from "@/components/teams/team-icon";
import { TeamPicker } from "@/components/teams/team-picker";
import { Button } from "@/components/ui/button";
import { useCustomCategories } from "@/lib/custom-categories";
import { TEAMS, type TeamId } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";

/* ==================================================================
   New issue-type modal. Opened from the "Add issue type" button in
   the routing matrix. Mirror of the TeamSetupModal chrome (portal,
   surface panel, ink accent) scoped to the three fields a custom
   category needs: label, color, and the team its reports route to.

   Submit calls addCustomCategory(), mutating the module-level
   custom-category snapshot the routing matrix renders live.
   ================================================================== */

const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#84cc16",
  "#d4d4d4",
  "#737373",
  "#a78bfa",
];

const DEFAULT_TEAM: TeamId = "general_admin";

export function AddCategoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addCustomCategory } = useCustomCategories();

  // Portal mount gate — SSR + first CSR render both return null so the
  // hydration trees match before createPortal runs on the second commit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [team, setTeam] = useState<TeamId>(DEFAULT_TEAM);
  const [submitted, setSubmitted] = useState(false);

  // Escape-to-close + scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const unlock = lockBodyScroll();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Reset the form each time the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setLabel("");
    setDescription("");
    setColor("#3b82f6");
    setTeam(DEFAULT_TEAM);
    setSubmitted(false);
  }, [open]);

  if (!mounted || !open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addCustomCategory({
      label: label.trim(),
      description: description.trim(),
      color,
      team,
    });
    setSubmitted(true);
  }

  const isValid = label.trim().length > 0;
  const RoutedIcon = teamIcon(TEAMS[team].icon);

  return createPortal(
    <div className="fixed inset-0 z-50 animate-in fade-in duration-200">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close issue-type setup"
        className="absolute inset-0 bg-black/75"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New issue type"
        className={cn(
          "absolute inset-2 sm:inset-x-0 sm:inset-y-auto sm:top-1/2 sm:-translate-y-1/2 sm:mx-auto sm:max-w-md",
          "flex max-h-[92dvh] flex-col overflow-hidden text-foreground",
          "rounded-[var(--radius-lg)] border border-hairline bg-surface",
          "shadow-[var(--shadow-pop)]",
          "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none",
        )}
      >
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            <div>
              <h2 className="text-[16px] font-semibold text-foreground leading-tight">
                New Issue Type
              </h2>
              <p className="text-[12px] text-faint leading-tight">
                Name it &amp; pick where its reports route
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </header>

        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)]"
              style={{ background: `${color}22`, color }}
            >
              <RoutedIcon className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success)]/20 text-[var(--status-success-fg)]">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                {label.trim()} added
              </h3>
              <p className="mt-1 text-sm text-subtle">
                Reports route to {TEAMS[team].shortLabel}.
              </p>
            </div>
            <Button onClick={onClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar p-5 pb-safe">
              {/* Label */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-subtle">
                  Issue type name
                </span>
                <input
                  type="text"
                  required
                  placeholder="Abandoned Vehicle"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                />
              </label>

              {/* Description — AI-facing. Drives auto-classification: the model
                  reads it to decide whether a photo fits this custom type. */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-subtle">
                  What it looks like{" "}
                  <span className="text-faint">
                    (helps AI auto-classify photos)
                  </span>
                </span>
                <textarea
                  rows={2}
                  placeholder="e.g. A car left parked and unmoved on a public street or lot, often with flat tires, expired tags, or visible damage."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                />
                <span className="text-[11px] leading-relaxed text-faint">
                  Without a description, new reports can still route here when
                  picked manually, but the AI won't auto-classify into it.
                </span>
              </label>

              {/* Color */}
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-subtle">
                  Color
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                        color === c
                          ? "border-hairline-strong"
                          : "border-transparent",
                      )}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                      title="Custom color"
                    />
                    <span className="text-[11px] text-faint">Custom</span>
                  </label>
                </div>
              </div>

              {/* Routing */}
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-subtle">
                  Routes to
                </span>
                <div className="flex items-center gap-2 rounded-lg border border-hairline bg-overlay px-3 py-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-sm text-subtle">
                    {label.trim() || "This issue type"}
                  </span>
                  <span className="text-faint" aria-hidden>
                    →
                  </span>
                  <TeamPicker
                    currentTeam={team}
                    defaultTeam={DEFAULT_TEAM}
                    onChange={setTeam}
                    align="right"
                    showOverrideTint={false}
                    labelMaxWidth={120}
                    menuWidth={240}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-faint">
                  Sets the routing rule for this issue type. You can change it
                  any time from the routing matrix.
                </p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-hairline px-5 py-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid}>
                Add Issue Type
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { MUNICIPALITIES, type Municipality } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";

/** First letter of up to the first two words, for the switcher's square
 *  identity chip (e.g. "Cumming" → "CU", "Forsyth County" → "FC"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * City switcher, search + toggle between municipalities from the dashboard
 * header. Live cities navigate to their dashboard; expansion targets render
 * disabled with a "Soon" badge so the rollout footprint is visible without
 * linking to empty dashboards.
 */
export function CitySwitcher({
  currentSlug,
  currentName,
  currentState,
  compact = false,
  className,
}: {
  currentSlug: string;
  /** DB-resolved identity for the active city when it isn't one of the
   *  hardcoded municipalities (e.g. a freshly-onboarded city). */
  currentName?: string | null;
  currentState?: string | null;
  /** Aligns the trigger to nav-control height (h-8) when nested in the header. */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // The directory includes onboarded cities that aren't in the hardcoded list:
  // when the active slug isn't found, synthesize a live entry from the
  // DB-resolved name/state so the header shows the real city, not Cumming.
  const directory = useMemo<Municipality[]>(() => {
    if (MUNICIPALITIES.some((m) => m.slug === currentSlug))
      return MUNICIPALITIES;
    return [
      {
        slug: currentSlug,
        name: currentName?.trim() || currentSlug,
        state: currentState?.trim() || "",
        county: "",
        live: true,
      },
      ...MUNICIPALITIES,
    ];
  }, [currentSlug, currentName, currentState]);

  const current = directory.find((m) => m.slug === currentSlug) ?? directory[0];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.county.toLowerCase().includes(q) ||
        m.state.toLowerCase().includes(q),
    );
  }, [query, directory]);

  useEffect(() => {
    if (!open) return;
    // Focus the search field when the popover opens.
    inputRef.current?.focus();

    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectCity(slug: string, live: boolean) {
    if (!live) return;
    setOpen(false);
    if (slug !== currentSlug) router.push(`/city/${slug}`);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex min-w-0 max-w-full items-center gap-2 rounded-[var(--radius-md)] border text-[13px] font-medium transition-colors",
          compact ? "h-8 px-2.5" : "min-h-11 px-3",
          open
            ? "border-accent/40 bg-accent-soft text-foreground"
            : "border-hairline bg-overlay text-foreground hover:border-hairline-strong hover:text-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-elevated font-mono text-[11px] font-semibold text-foreground"
        >
          {initials(current.name)}
        </span>
        <span className="truncate">
          {current.name}
          {current.state && (
            <span className="text-faint">, {current.state}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Switch municipality"
          className={cn(
            "absolute left-0 top-[calc(100%+8px)] z-50 w-[20rem] origin-top",
            "rounded-[var(--radius-lg)] border border-hairline bg-surface p-2",
            "shadow-[var(--shadow-pop)] ring-1 ring-hairline",
            "animate-[city-pop_120ms_ease-out]",
          )}
        >
          {/* Search */}
          <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-hairline bg-overlay px-2.5">
            <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search municipalities"
              className="min-h-10 w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-faint"
            />
          </div>

          <div className="max-h-[18rem] overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-faint">
                No municipalities match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              results.map((m) => {
                const selected = m.slug === currentSlug;
                return (
                  <button
                    key={m.slug}
                    type="button"
                    onClick={() => selectCity(m.slug, m.live)}
                    disabled={!m.live}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors",
                      m.live
                        ? "hover:bg-overlay"
                        : "cursor-not-allowed opacity-55",
                      selected && "bg-overlay-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-accent bg-accent text-accent-contrast"
                          : "border-hairline-strong text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-[14px] font-medium",
                          selected ? "text-foreground" : "text-subtle",
                        )}
                      >
                        {m.name}
                        {m.state ? `, ${m.state}` : ""}
                      </span>
                      <span className="truncate text-[11px] text-faint">
                        {m.county}
                      </span>
                    </span>
                    {m.live ? (
                      <Badge variant="success" className="shrink-0">
                        Live
                      </Badge>
                    ) : (
                      <Badge className="shrink-0">Soon</Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

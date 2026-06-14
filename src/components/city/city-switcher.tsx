"use client";

import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MUNICIPALITIES } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";

/**
 * City switcher — search + toggle between municipalities from the dashboard
 * header. Live cities navigate to their dashboard; expansion targets render
 * disabled with a "Soon" badge so the rollout footprint is visible without
 * linking to empty dashboards.
 */
export function CitySwitcher({
  currentSlug,
  compact = false,
  className,
}: {
  currentSlug: string;
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

  const current =
    MUNICIPALITIES.find((m) => m.slug === currentSlug) ?? MUNICIPALITIES[0];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MUNICIPALITIES;
    return MUNICIPALITIES.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.county.toLowerCase().includes(q) ||
        m.state.toLowerCase().includes(q),
    );
  }, [query]);

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
          "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border text-[13px] font-medium transition-colors",
          compact ? "h-8 px-3" : "min-h-11 px-3.5",
          open
            ? "border-[#0a84ff]/40 bg-[#0a84ff]/10 text-white"
            : "border-white/[0.08] bg-white/[0.02] text-zinc-200 hover:border-white/15 hover:text-white",
        )}
      >
        <MapPin className="h-4 w-4 shrink-0 text-[#0a84ff]" aria-hidden />
        <span className="truncate">
          {current.name}
          <span className="text-zinc-500">, {current.state}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
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
            "rounded-[16px] border border-white/[0.08] bg-[#1c1c1e] p-2",
            "shadow-[0_20px_48px_-12px_rgba(0,0,0,0.75)] ring-1 ring-black/40",
            "animate-[city-pop_120ms_ease-out]",
          )}
        >
          {/* Search */}
          <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-white/[0.08] bg-black/30 px-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search municipalities"
              className="min-h-10 w-full bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>

          <div className="max-h-[18rem] overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-zinc-500">
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
                        ? "hover:bg-white/[0.05]"
                        : "cursor-not-allowed opacity-55",
                      selected && "bg-white/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-[#0a84ff] bg-[#0a84ff] text-white"
                          : "border-white/15 text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-[14px] font-medium",
                          selected ? "text-white" : "text-zinc-200",
                        )}
                      >
                        {m.name}, {m.state}
                      </span>
                      <span className="truncate text-[11px] text-zinc-500">
                        {m.county}
                      </span>
                    </span>
                    {m.live ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[#34c759]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#34c759] shadow-[0_0_6px_rgba(52,199,89,0.7)]" />
                        Live
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        Soon
                      </span>
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

"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CitySuggestion } from "@/lib/onboarding/types";
import { searchCities } from "./actions";

const inputCls =
  "w-full rounded-lg border border-hairline bg-surface pl-9 pr-9 py-2.5 text-sm text-foreground outline-none transition-shadow placeholder:text-faint focus:ring-2 focus:ring-[#0a84ff]/50";

/**
 * City autocomplete — one search box that replaces the old name + state
 * fields. Types stream to `searchCities` (Nominatim) debounced; each pick
 * carries its own center point, so the wizard sets the map center directly
 * from the selection (no second geocode round-trip).
 *
 * Stale responses are dropped by comparing the in-flight query against the
 * latest one (server actions can't be AbortController-cancelled). The debounce
 * cuts per-client request volume, but OSM's public endpoint rate-limits
 * autocomplete — see searchCities() for the at-scale provider note.
 */
export function CitySearch({
  value,
  onSelect,
  onClear,
  placeholder = "Search for your city…",
}: {
  /** Currently-selected city, used only to seed the input on first render. */
  value: { name: string; state: string } | null;
  onSelect: (s: CitySuggestion) => void;
  /** Fired when the user edits away from a committed pick, so the parent can
   *  invalidate the stale selection (otherwise the submitted city wouldn't
   *  match the visible input). */
  onClear?: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(() =>
    value ? `${value.name}, ${value.state}` : "",
  );
  const [results, setResults] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  // Latest query string still considered "current" — drops stale responses.
  const latestQuery = useRef(query);
  // The label written by a selection; the search effect skips it so picking a
  // city doesn't immediately re-query its own label and reopen the dropdown.
  const selectedLabel = useRef(query);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Debounced search on query change.
  useEffect(() => {
    const q = query.trim();
    latestQuery.current = q;

    if (q.length < 3 || q === selectedLabel.current) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const t = setTimeout(() => {
      void searchCities(q).then((r) => {
        // Query moved on while this request was in flight → ignore.
        if (latestQuery.current !== q) return;
        setResults(r);
        setActive(r.length > 0 ? 0 : -1);
        setLoading(false);
        setOpen(true);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside pointer / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function choose(s: CitySuggestion) {
    const label = `${s.name}, ${s.state}`;
    selectedLabel.current = label;
    latestQuery.current = label;
    onSelect(s);
    setQuery(label);
    setResults([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && results.length > 0) {
        setOpen(true);
        return;
      }
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showPanel =
    open && (loading || results.length > 0 || query.trim().length >= 3);

  return (
    <div ref={rootRef} className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        aria-hidden
      />
      <input
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        className={inputCls}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          // Editing away from a committed pick invalidates it: re-enable search
          // (drop the skip-label guard) and tell the parent to clear the stale
          // selection so Continue can't submit a city that no longer matches.
          if (selectedLabel.current && v !== selectedLabel.current) {
            selectedLabel.current = "";
            onClear?.();
          }
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {loading && (
        <Loader2
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-faint"
          aria-hidden
        />
      )}

      {showPanel && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="City results"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-[14px] border border-hairline bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-hairline"
        >
          {results.length === 0 ? (
            <p className="px-2 py-4 text-center text-[13px] text-faint">
              {loading ? "Searching…" : `No cities match “${query.trim()}”.`}
            </p>
          ) : (
            results.map((s, i) => (
              <button
                key={`${s.name}-${s.state}-${s.lat}`}
                id={optionId(i)}
                type="button"
                role="option"
                aria-selected={i === active}
                onClick={() => choose(s)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors ${
                  i === active ? "bg-overlay-strong" : "hover:bg-overlay"
                }`}
              >
                <MapPin
                  className="h-4 w-4 shrink-0 text-[#0a84ff]"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-medium text-foreground">
                    {s.name}, {s.state}
                  </span>
                  <span className="truncate text-[11px] text-faint">
                    {s.displayName}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

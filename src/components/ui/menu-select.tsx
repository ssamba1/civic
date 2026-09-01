// src/components/ui/menu-select.tsx
"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   MenuSelect, the staff-console dropdown.

   A button-trigger + portal listbox replacing native <select> in the
   admin modals (Role, Team, Division, Crew type). Native selects
   can't style their popup or host an inline "add new" row; this one
   does both while keeping the listbox keyboard contract.

   Focus stays on the trigger (aria-activedescendant pattern): the
   menu portals to <body>, outside MemberModalShell's focus trap, so
   moving real focus into it would fight the trap.
   ================================================================== */

export interface MenuSelectOption {
  value: string;
  label: string;
  /** Faint right-aligned annotation (e.g. a crew type's description cue). */
  hint?: string;
  /** Small color dot before the label (e.g. division color). */
  swatch?: string;
}

export interface MenuSelectProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: MenuSelectOption[];
  /** Label for the null choice. When set, it renders as the first option. */
  placeholder?: string;
  disabled?: boolean;
  /** Action row (e.g. "+ New type…"), pinned to the TOP of the menu. Closes
   *  the menu, then fires. */
  action?: { label: string; onSelect: () => void };
  className?: string;
}

const MENU_MAX_H = 240;
const GAP = 4;

export function MenuSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  action,
  className,
}: MenuSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    up: boolean;
    maxH: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });
  const listboxId = useId();

  // The rendered rows: action row pinned first (top), then the optional null
  // row, then options.
  const rows: Array<
    | {
        kind: "option";
        value: string | null;
        label: string;
        hint?: string;
        swatch?: string;
      }
    | { kind: "action"; label: string }
  > = [
    ...(action ? [{ kind: "action" as const, label: action.label }] : []),
    ...(placeholder !== undefined
      ? [{ kind: "option" as const, value: null, label: placeholder }]
      : []),
    ...options.map((o) => ({ kind: "option" as const, ...o })),
  ];

  const selectedIndex = rows.findIndex(
    (r) => r.kind === "option" && r.value === value,
  );
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : null;
  const triggerLabel =
    selected && selected.kind === "option"
      ? selected.label
      : (placeholder ?? "Select…");

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP - 8;
    const spaceAbove = r.top - GAP - 8;
    // Flip up only when below is too tight AND above has more room.
    const up = spaceBelow < MENU_MAX_H && spaceAbove > spaceBelow;
    const maxH = Math.max(
      120,
      Math.min(MENU_MAX_H, up ? spaceAbove : spaceBelow),
    );
    setPos({
      top: up ? r.top - GAP : r.bottom + GAP,
      left: r.left,
      width: r.width,
      up,
      maxH,
    });
  }, []);

  function openMenu() {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    position();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setPos(null);
  }

  function commit(index: number) {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "action") {
      close();
      action?.onSelect();
      return;
    }
    onChange(row.value);
    close();
  }

  // Reposition while open on scroll/resize anywhere (capture: the modal body
  // scrolls, not the window).
  useLayoutEffect(() => {
    if (!open) return;
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open, position]);

  // Outside pointerdown closes. The trigger's own pointerdown toggles instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on `open` alone. The listener must (un)subscribe when the menu opens/closes, not re-run each render. `close`, `menuRef`, and `triggerRef` are stable (state setters / refs), so no stale closure.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t))
        return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row visible while arrowing.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function moveActive(delta: number) {
    setActive((cur) => {
      const next = Math.min(Math.max(cur + delta, 0), rows.length - 1);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(rows.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        // Stop the modal's own escape-to-close from also firing.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default: {
        if (e.key.length !== 1) return;
        const now = Date.now();
        const t = typeahead.current;
        t.buffer = now - t.at > 500 ? e.key : t.buffer + e.key;
        t.at = now;
        const q = t.buffer.toLowerCase();
        const hit = rows.findIndex(
          (r) => r.kind === "option" && r.label.toLowerCase().startsWith(q),
        );
        if (hit >= 0) setActive(hit);
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        onPointerDown={(e) => {
          e.preventDefault(); // keep focus on the trigger (aria-activedescendant pattern)
          triggerRef.current?.focus();
          if (open) close();
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-left text-[13px] text-foreground outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 truncate",
            value === null && placeholder !== undefined && "text-subtle",
          )}
        >
          {selected?.kind === "option" && selected.swatch && (
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected.swatch }}
              aria-hidden
            />
          )}
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-faint transition-transform duration-150",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              ...(pos.up
                ? { bottom: window.innerHeight - pos.top }
                : { top: pos.top }),
            }}
            className={cn(
              "z-[60] overflow-y-auto custom-scrollbar rounded-[var(--radius-md)] border border-hairline bg-surface p-1 shadow-[var(--shadow-pop)]",
              "animate-[city-pop_120ms_ease-out] motion-reduce:animate-none",
            )}
          >
            <div style={{ maxHeight: pos.maxH }}>
              {rows.map((row, i) => {
                if (row.kind === "action") {
                  return (
                    <div key="__action" role="presentation">
                      {/* biome-ignore lint/a11y/useFocusableInteractive: aria-activedescendant listbox. Focus stays on the trigger by design; options are not individually tabbable. */}
                      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the trigger's onKeyDown (roving activedescendant); onClick is the pointer-only fallback. */}
                      <div
                        id={`${listboxId}-${i}`}
                        role="option"
                        aria-selected={false}
                        data-index={i}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => commit(i)}
                        onMouseMove={() => setActive(i)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-subtle",
                          active === i && "bg-overlay-strong text-foreground",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        {row.label}
                      </div>
                      <div className="mx-1 my-1 border-t border-hairline" />
                    </div>
                  );
                }
                const isSelected = row.value === value;
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: aria-activedescendant listbox. Focus stays on the trigger by design; options are not individually tabbable.
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the trigger's onKeyDown (roving activedescendant); onClick is the pointer-only fallback.
                  <div
                    key={row.value ?? "__null"}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    data-index={i}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => commit(i)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-foreground",
                      active === i && "bg-overlay-strong",
                    )}
                  >
                    {row.swatch && (
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: row.swatch }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.hint && (
                      <span className="max-w-[45%] flex-shrink-0 truncate text-[11px] text-faint">
                        {row.hint}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 flex-shrink-0 text-foreground"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

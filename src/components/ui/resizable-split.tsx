"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

const MIN_PCT = 28;
const MAX_PCT = 72;
const STEP = 3;

function clamp(n: number) {
  return Math.min(MAX_PCT, Math.max(MIN_PCT, n));
}

function readSaved(key?: string): number {
  if (!key || typeof window === "undefined") return 50;
  const raw = Number(window.localStorage.getItem(key));
  return raw >= MIN_PCT && raw <= MAX_PCT ? raw : 50;
}

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** When false, only `left` renders full-width, no divider, no split. */
  active: boolean;
  /** localStorage key to remember the divider position across reloads. */
  storageKey?: string;
  className?: string;
}

/**
 * Two-pane layout with a draggable vertical divider. `left` keeps a percentage
 * width; `right` fills the rest. Drag the handle (or focus it and use ←/→) to
 * resize. The position is persisted lazily so a reload race can't clobber it.
 */
export function ResizableSplit({
  left,
  right,
  active,
  storageKey,
  className,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(() => readSaved(storageKey));
  const pctRef = useRef(pct);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = clamp(((e.clientX - rect.left) / rect.width) * 100);
      pctRef.current = next;
      setPct(next);
    };
    const onUp = () => {
      setDragging(false);
      if (storageKey) {
        window.localStorage.setItem(
          storageKey,
          String(Math.round(pctRef.current)),
        );
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, storageKey]);

  function onKeyDown(e: React.KeyboardEvent) {
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = clamp(pctRef.current - STEP);
    else if (e.key === "ArrowRight") next = clamp(pctRef.current + STEP);
    if (next === null) return;
    e.preventDefault();
    pctRef.current = next;
    setPct(next);
    if (storageKey) {
      window.localStorage.setItem(storageKey, String(Math.round(next)));
    }
  }

  if (!active) {
    return <div className={className}>{left}</div>;
  }

  return (
    <div ref={containerRef} className={cn("flex items-stretch", className)}>
      <div className="min-w-0" style={{ width: `${pct}%` }}>
        {left}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a draggable, focusable window-splitter must be a div. <hr> can't host the handle, tabIndex, or pointer drag. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={MIN_PCT}
        aria-valuemax={MAX_PCT}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative flex w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]",
        )}
      >
        <span
          className={cn(
            "h-10 w-[3px] rounded-full bg-overlay-strong transition-colors",
            "group-hover:bg-overlay-strong group-focus-visible:bg-[color-mix(in_srgb,var(--color-primary)_80%,transparent)]",
            dragging && "bg-[var(--color-primary)]",
          )}
        />
      </div>

      <div className="min-w-0 flex-1">{right}</div>
    </div>
  );
}

"use client";

import { ArrowUpRight, HelpCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { type Box, CalloutOverlay, useSpots } from "./callout-overlay";
import { guideForPath } from "./guide-content";

/* ==================================================================
   "What is this page?" — the demo guide.

   Opened from the city sidebar footer. Reads the current route, shows
   what that page is, what is on it and why it exists, and rings the
   real elements it is talking about.

   Deliberately NOT a centre-screen modal: the whole point is that the
   page stays visible behind it. The panel docks to one edge and the
   callout layer spotlights the elements it names.
   ================================================================== */

/** Trigger for the city sidebar footer. Sized as a peer of ThemeToggle. */
export function PageGuideButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="About this page"
        title="About this page"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-faint",
          "border-hairline bg-overlay transition-colors duration-150 outline-none",
          "hover:bg-overlay-strong hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
          className,
        )}
      >
        <HelpCircle
          className="h-3.5 w-3.5"
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      <PageGuideDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PageGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const guide = guideForPath(pathname);

  // Portal mount gate — SSR and the first client render both return null so
  // the hydration trees match before createPortal runs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  // The panel's own rect, so no callout chip is ever drawn underneath it.
  const panelRect = useCallback((): Box | null => {
    const el = panelRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - 12, y: r.top - 12, w: r.width + 24, h: r.height + 24 };
  }, []);

  const spots = useSpots(open && mounted, guide.points, panelRect);
  const anchored = new Set(spots.map((s) => s.index));

  // Escape to close, focus into the panel on open, focus back to the opener
  // on close, and Tab trapped at the panel's boundaries.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const el = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (el === first || el === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && el === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Locked while open so measured rects cannot drift under the drawing.
    const unlock = lockBodyScroll();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  // Reset the hover emphasis whenever the guide reopens.
  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 animate-backdrop-in">
      {/* Click-anywhere-to-close sits UNDER the callout layer, which is
          pointer-events-none, so the spotlit elements stay visible but the
          page underneath is inert while the guide is open. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close page guide"
        className="absolute inset-0 cursor-default"
      />

      <CalloutOverlay spots={spots} active={active} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-guide-title"
        tabIndex={-1}
        className={cn(
          "absolute inset-x-2 bottom-2 max-h-[76vh] sm:inset-x-auto sm:top-4 sm:bottom-4 sm:max-h-none sm:w-[384px]",
          guide.dock === "left" ? "sm:left-4" : "sm:right-4",
          "flex flex-col overflow-hidden text-foreground",
          "rounded-[var(--radius-lg)] border border-hairline bg-surface",
          "shadow-[var(--shadow-pop)]",
          "origin-center animate-[city-pop_120ms_ease-out]",
        )}
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2
              id="page-guide-title"
              className="text-[16px] font-semibold leading-tight text-foreground"
            >
              {guide.title}
            </h2>
            <p className="mt-1 truncate font-mono text-[11px] text-faint">
              {pathname}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-faint outline-none transition-colors hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-5">
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              What this is
            </h3>
            <p className="text-[13px] leading-relaxed text-subtle">
              {guide.what}
            </p>
          </section>

          {guide.points.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                On this screen
              </h3>
              <ul className="flex flex-col gap-1">
                {guide.points.map((point, i) => {
                  const onScreen = anchored.has(i);
                  return (
                    <li key={point.label}>
                      {/* Hovering a row emphasises its ring on the page and
                          dims the rest — the panel and the page are the two
                          halves of one explanation. */}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover emphasis only; the row carries no action and is fully readable without it */}
                      <div
                        onMouseEnter={() => setActive(onScreen ? i : null)}
                        onMouseLeave={() => setActive(null)}
                        className={cn(
                          "flex gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150",
                          onScreen && "hover:bg-overlay",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums",
                            onScreen
                              ? "bg-accent text-accent-contrast"
                              : "border border-hairline-strong text-faint",
                          )}
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-foreground">
                            {point.label}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-faint">
                            {point.text}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Why it matters
            </h3>
            <ul className="flex flex-col gap-2.5">
              {guide.why.map((line) => (
                <li
                  key={line}
                  className="flex gap-2.5 text-[12.5px] leading-relaxed text-subtle"
                >
                  <span
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint"
                    aria-hidden="true"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          {guide.readmeHref ? (
            <a
              href={guide.readmeHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 rounded-md text-[12.5px] font-medium text-accent-text outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span className="truncate">{guide.readmeLabel}</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2}
                aria-hidden="true"
              />
            </a>
          ) : (
            <span className="text-[12.5px] text-faint">Esc to close</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-hairline bg-overlay px-3 py-1.5 text-[12.5px] font-medium text-subtle outline-none transition-colors hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Trap Tab / Shift+Tab focus inside a dialog panel while `active` (WCAG 2.4.3 /
 * 2.1.2 — no keyboard trap escaping the modal, but focus must not leak to the
 * inert background either). Shared by Modal / Drawer / BottomSheet, which
 * already handle Esc, scroll-lock, and focus-restore; this adds the missing
 * cycle so keyboard users can't Tab out of an open dialog into background
 * controls.
 *
 * Reads focusable children live on each Tab (menus/inputs mount after open), so
 * it doesn't cache a stale node list. No-ops when inactive or empty.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        // Nothing focusable but the panel itself — keep focus on the panel.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey) {
        if (activeEl === first || activeEl === panel) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [panelRef, active]);
}

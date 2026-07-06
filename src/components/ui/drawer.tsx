"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";

export interface DrawerProps {
  /** Whether the drawer is visible. The drawer mounts only while open so the
   *  slide-in animation re-fires on every open. */
  open: boolean;
  /** Called when the user requests a close (Esc, backdrop tap, or close button). */
  onClose: () => void;
  /** Side the panel slides in from. Defaults to "right". */
  side?: "right" | "left";
  /** Optional heading rendered in a sticky header (also used as the dialog label). */
  title?: string;
  /** Optional className merged onto the sliding panel. */
  className?: string;
  children?: React.ReactNode;
}

/**
 * Reusable slide-in Drawer primitive.
 *
 * Mobile-native side panel: full dynamic-viewport height, capped width, safe-area
 * aware, reduced-motion aware. Closes on Esc, backdrop tap, or the close button.
 *
 * Desktop is unchanged from any inline/side-by-side layout a caller already uses —
 * this primitive is intended for the mobile branch of a "Drawer on mobile,
 * inline on desktop" pattern.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  className,
  children,
}: DrawerProps) {
  const titleId = React.useId();
  // Portal only after mount so SSR markup matches and `fixed` positioning is
  // measured against the viewport, never a transformed ancestor (map/GSAP).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Close on Escape while open.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock body scroll while open so the page behind the drawer doesn't move.
  React.useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  const isRight = side !== "left";

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Component-scoped keyframes. Mirrors the repo pattern (filter-bar.tsx)
          of inline <style> for local animation, so this primitive is fully
          self-contained and does not depend on a globals.css keyframe. */}
      <style>{`
        @keyframes drawer-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes drawer-in-right {
          from { transform: translateX(100%) }
          to   { transform: translateX(0) }
        }
        @keyframes drawer-in-left {
          from { transform: translateX(-100%) }
          to   { transform: translateX(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          .civic-drawer-backdrop { animation: drawer-backdrop-in 120ms linear both !important; }
          .civic-drawer-panel { animation: drawer-backdrop-in 140ms linear both !important; }
        }
      `}</style>

      {/* Backdrop — tap to close. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="civic-drawer-backdrop absolute inset-0 h-full w-full cursor-default bg-black/50"
        style={{ animation: "drawer-backdrop-in 220ms ease-out both" }}
      />

      {/* Side panel. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : "Panel"}
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "civic-drawer-panel pt-safe pb-safe absolute top-0 flex h-dvh w-[min(92vw,420px)] flex-col overflow-y-auto bg-[var(--color-background)] shadow-[0_8px_40px_rgba(0,0,0,0.35)] outline-none",
          isRight
            ? "right-0 rounded-l-[var(--radius-lg)] border-l border-[var(--color-border)]"
            : "left-0 rounded-r-[var(--radius-lg)] border-r border-[var(--color-border)]",
          className,
        )}
        style={{
          // Inline safe-area fallback so the panel is correct even before the
          // .pt-safe/.pb-safe utilities resolve, and so left/right insets apply.
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingRight: isRight ? "env(safe-area-inset-right)" : undefined,
          paddingLeft: isRight ? undefined : "env(safe-area-inset-left)",
          animation: `${isRight ? "drawer-in-right" : "drawer-in-left"} 300ms cubic-bezier(0.16,1,0.3,1) both`,
        }}
      >
        {title ? (
          <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 px-4 backdrop-blur-md">
            <h2
              id={titleId}
              className="truncate text-base font-semibold text-[var(--color-foreground)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-muted)] transition-colors hover:bg-overlay hover:text-[var(--color-foreground)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "absolute top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-hairline bg-surface text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]",
              isRight ? "right-3" : "left-3",
            )}
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="min-h-0 flex-1 px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;

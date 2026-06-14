"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Mobile bottom sheet. Renders into document.body via a portal so it escapes
 * any transform / backdrop-filter containing block in parent components
 * (e.g. .glass-panel), which would otherwise trap position:fixed.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while open. Reference-counted so concurrent
  // sheets/drawers don't restore a stale "hidden" on close.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Move focus into the sheet on open; restore on close.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prevActive?.focus?.();
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop — the only close target. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 animate-backdrop-in"
      />

      {/* Panel */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is a propagation guard, not an activation handler — the panel is a dialog container, not a control. Keyboard dismissal is handled by Escape and the focusable Close backdrop button. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Sheet"}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-safe shadow-[0_-8px_40px_rgba(0,0,0,0.25)] outline-none custom-scrollbar",
          "animate-[sheet-up_0.32s_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none",
          className,
        )}
      >
        {/* Grab handle */}
        <div className="sticky top-0 z-10 flex flex-col items-center bg-[var(--color-surface)] pt-2.5">
          <span
            aria-hidden
            className="h-1 w-9 rounded-full bg-[var(--color-border)]"
          />
          {title ? (
            <div className="mt-1.5 flex w-full items-center justify-between gap-3 px-5 pb-3">
              <h2
                id={titleId}
                className="text-base font-semibold text-[var(--color-foreground)]"
              >
                {title}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors active:bg-black/5 dark:active:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="h-2.5" />
          )}
        </div>

        <div className="px-5 pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

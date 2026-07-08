"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Action row pinned to the bottom (e.g. Cancel / Confirm buttons). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Centered dialog. Same portal + Esc + scroll-lock + focus-restore contract as
 * BottomSheet/Drawer, for confirmations (e.g. go-live). role="dialog"
 * aria-modal, labelled by title.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prevActive?.focus?.();
  }, [open]);

  useFocusTrap(panelRef, open);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 animate-backdrop-in"
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is a propagation guard, not an activation handler; Esc + the focusable Close backdrop handle dismissal. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_20px_60px_-12px_rgba(0,0,0,0.4)] outline-none",
          "animate-[fade-up_0.24s_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-[var(--color-foreground)]"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1.5 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] outline-offset-2 transition-colors hover:bg-[var(--color-surface)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5 pt-3">
          {description && (
            <p id={descId} className="text-sm text-[var(--color-muted)]">
              {description}
            </p>
          )}
          {children && (
            <div className={cn(description && "mt-3")}>{children}</div>
          )}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

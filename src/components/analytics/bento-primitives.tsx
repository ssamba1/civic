"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Shared bento shell + modal + motion + control primitives.

   Extracted from analytics-bento.tsx so the same vocabulary can be
   reused by Teams (and any future bento surface) without duplicating
   the motion/reveal/expand-modal machinery.

   Visual contract: flat Apple-dark panels — #1c1c1e fill,
   white/[0.06] hairline border, --radius-lg corners. Motion is
   CSS-driven and gated by `prefers-reduced-motion: no-preference`.
   ================================================================== */

const BENTO_MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  [data-bento-reveal] {
    opacity: 0;
    transform: translateY(10px);
  }
  [data-bento-reveal][data-shown="1"] {
    opacity: 1;
    transform: none;
    transition: opacity 520ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 560ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}
`;

let bentoMotionInjected = false;

export function useBentoMotionStyles() {
  useEffect(() => {
    if (bentoMotionInjected || typeof document === "undefined") return;
    const el = document.createElement("style");
    el.dataset.bentoMotion = "1";
    el.textContent = BENTO_MOTION_CSS;
    document.head.appendChild(el);
    bentoMotionInjected = true;
  }, []);
}

export function useReveal<T extends HTMLElement>() {
  useBentoMotionStyles();
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const id = requestAnimationFrame(() => {
      node.setAttribute("data-shown", "1");
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return ref;
}

interface TileProps {
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
  onExpand?: () => void;
}

export function Tile({ title, subtitle, className, children, onExpand }: TileProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-bento-reveal
      className={cn(
        "flex flex-col rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-4 sm:p-5 text-zinc-100",
        "shadow-[0_1px_2px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      {(title || onExpand) && (
        <header className="flex items-center justify-between gap-3 mb-3 sm:mb-4 min-h-[20px]">
          <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
            {title && (
              <h2 className="text-[14px] sm:text-[15px] font-semibold text-white truncate">
                {title}
              </h2>
            )}
            {subtitle && (
              <span className="text-[11px] sm:text-[12px] text-zinc-400 truncate">
                {subtitle}
              </span>
            )}
          </div>
          {onExpand && (
            /* 44×44 tap target on mobile via negative margin + inline-flex centering */
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand chart"
              className="flex-shrink-0 -m-2 inline-flex h-11 w-11 items-center justify-center text-zinc-500 hover:text-white rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </header>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

interface ExpandModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  chart: React.ReactNode;
  controls?: React.ReactNode;
  info?: React.ReactNode;
}

export function ExpandModal({
  open,
  onClose,
  title,
  subtitle,
  chart,
  controls,
  info,
}: ExpandModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close expanded chart"
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />
      <div
        className={cn(
          /* Mobile: full-width bottom sheet, max 90dvh */
          "relative w-full sm:max-w-[min(92vw,1400px)] flex flex-col text-zinc-100 overflow-hidden",
          "max-h-[90dvh] sm:max-h-[92vh]",
          "rounded-t-[18px] sm:rounded-[18px] border border-white/[0.06] bg-[#1c1c1e]",
          "shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]",
          "animate-in zoom-in-95 duration-200",
        )}
      >
        <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/[0.06]">
          <div className="flex items-baseline gap-2 sm:gap-3 min-w-0 flex-wrap">
            <h2 className="text-[18px] sm:text-[22px] font-semibold text-white tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <span className="text-[12px] sm:text-[13px] text-zinc-400">{subtitle}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 -m-1.5 inline-flex h-11 w-11 items-center justify-center text-zinc-400 hover:text-white rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-safe">
          {/* Mobile: chart + controls stack vertically; lg+: side-by-side */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 sm:gap-6 p-4 sm:p-6">
            <div className="min-w-0">{chart}</div>
            {controls && (
              <aside className="flex flex-col gap-4 lg:border-l lg:border-white/[0.06] lg:pl-6">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Controls
                </p>
                {controls}
              </aside>
            )}
          </div>
          {info && (
            <div className="border-t border-white/[0.06] px-4 sm:px-6 py-4 sm:py-5">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">
                About this chart
              </p>
              {info}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ==================================================================
   Control primitives
   ================================================================== */

export function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <p className="text-[12px] text-zinc-400 mb-1.5">{label}</p>
      )}
      <div className="inline-flex rounded-lg bg-white/[0.04] p-0.5">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              /* min 44px tap target on mobile */
              "min-h-[44px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 text-[13px] sm:text-[12px] rounded-md transition-colors",
              value === opt.value
                ? "bg-white/[0.1] text-white"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  dotColor,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex min-h-[44px] sm:min-h-0 items-center justify-between gap-3 text-[13px] text-zinc-300 hover:text-white transition-colors w-full"
    >
      <span className="inline-flex items-center gap-2">
        {dotColor && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: dotColor }}
          />
        )}
        {label}
      </span>
      <span
        className={cn(
          "h-4 w-7 rounded-full transition-colors flex items-center px-0.5",
          value ? "bg-[#0a84ff]" : "bg-white/[0.1]",
        )}
      >
        <span
          className={cn(
            "block h-3 w-3 rounded-full bg-white transition-transform",
            value ? "translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-[22px] font-semibold tracking-tight text-white tabular-nums mt-1 leading-none">
        {value}
      </p>
      {hint && (
        <p className="text-[12px] text-zinc-500 mt-1.5">{hint}</p>
      )}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">{children}</div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-zinc-400 max-w-prose">
      {children}
    </p>
  );
}

export function EmptyState({ message = "No data in range" }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-1 items-center justify-center">
      <p className="text-[13px] text-zinc-500">{message}</p>
    </div>
  );
}

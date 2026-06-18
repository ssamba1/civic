"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Hover tip primitive — portal-rendered, follows cursor, deeper
   contextual stats on hover. Shared across analytics tiles.
   ================================================================== */

export type HoverTipPlacement = "auto" | "top" | "bottom" | "left" | "right";

export interface HoverTipContent {
  title?: ReactNode;
  body: ReactNode;
  accent?: string; // CSS color for accent stripe / dot
  footer?: ReactNode;
}

interface HoverTipState extends HoverTipContent {
  x: number;
  y: number;
  placement: HoverTipPlacement;
  visible: boolean;
}

interface UseHoverTipReturn {
  show: (
    content: HoverTipContent,
    e: { clientX: number; clientY: number },
    placement?: HoverTipPlacement,
  ) => void;
  move: (e: { clientX: number; clientY: number }) => void;
  hide: () => void;
  bindTarget: (
    contentOrFactory:
      | HoverTipContent
      | ((e: React.MouseEvent) => HoverTipContent),
    placement?: HoverTipPlacement,
  ) => HoverHandlers;
  Portal: () => ReactNode;
}

interface HoverHandlers {
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
}

const OFFSET = 14;
const TIP_MIN_WIDTH = 220;
const TIP_MAX_WIDTH = 320;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function reducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useHoverTip(): UseHoverTipReturn {
  const [state, setState] = useState<HoverTipState>({
    body: null,
    x: 0,
    y: 0,
    placement: "auto",
    visible: false,
  });
  const tipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Latest state mirrored into a ref so Portal can keep a stable identity
  // (deps: [mounted]) yet still render the current value. JSX uses <tip.Portal/>;
  // a changing function reference would remount the whole portal tree every move.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Portal mount gate: SSR and the first client render must agree (both null),
  // otherwise hydration mismatches. The tooltip mounts after hydration.
  const [mounted, setMounted] = useState(false);
  // Track last pointer type so click handler knows whether to toggle (touch) or no-op (mouse).
  const lastPointerType = useRef<string>("mouse");
  // Mirror visibility into a ref so the touch onClick reads the current value
  // without closing over state.visible — keeps bindTarget's identity stable.
  const visibleRef = useRef(false);
  useEffect(() => {
    visibleRef.current = state.visible;
  }, [state.visible]);

  const positionFor = useCallback(
    (
      x: number,
      y: number,
      placement: HoverTipPlacement,
    ): { x: number; y: number; placement: HoverTipPlacement } => {
      if (typeof window === "undefined") return { x, y, placement };
      const tipEl = tipRef.current;
      const w = tipEl?.offsetWidth ?? TIP_MIN_WIDTH;
      const h = tipEl?.offsetHeight ?? 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let chosen: HoverTipPlacement = placement;
      if (placement === "auto") {
        chosen =
          y - h - OFFSET > 8
            ? "top"
            : y + h + OFFSET < vh - 8
              ? "bottom"
              : x + w + OFFSET < vw - 8
                ? "right"
                : "left";
      }

      let tx = x;
      let ty = y;
      switch (chosen) {
        case "top":
          tx = x - w / 2;
          ty = y - h - OFFSET;
          break;
        case "bottom":
          tx = x - w / 2;
          ty = y + OFFSET;
          break;
        case "left":
          tx = x - w - OFFSET;
          ty = y - h / 2;
          break;
        case "right":
          tx = x + OFFSET;
          ty = y - h / 2;
          break;
      }

      tx = clamp(tx, 8, vw - w - 8);
      ty = clamp(ty, 8, vh - h - 8);
      return { x: tx, y: ty, placement: chosen };
    },
    [],
  );

  const show: UseHoverTipReturn["show"] = useCallback(
    (content, e, placement = "auto") => {
      setState((prev) => {
        const pos = positionFor(e.clientX, e.clientY, placement);
        return {
          ...prev,
          ...content,
          x: pos.x,
          y: pos.y,
          placement: pos.placement,
          visible: true,
        };
      });
    },
    [positionFor],
  );

  const move: UseHoverTipReturn["move"] = useCallback(
    (e) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setState((prev) => {
          if (!prev.visible) return prev;
          const pos = positionFor(e.clientX, e.clientY, prev.placement);
          return { ...prev, x: pos.x, y: pos.y };
        });
      });
    },
    [positionFor],
  );

  const hide: UseHoverTipReturn["hide"] = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const bindTarget: UseHoverTipReturn["bindTarget"] = useCallback(
    (contentOrFactory, placement = "auto") => {
      const resolve = (e: React.MouseEvent | React.FocusEvent) => {
        if (typeof contentOrFactory === "function") {
          return contentOrFactory(e as React.MouseEvent);
        }
        return contentOrFactory;
      };
      return {
        onPointerEnter: (e) => {
          lastPointerType.current = e.pointerType;
          // On touch: do not show on enter (wait for click/tap instead)
          if (e.pointerType === "touch") return;
          show(resolve(e), e, placement);
        },
        onPointerMove: (e) => {
          if (e.pointerType === "touch") return;
          move(e);
        },
        onPointerLeave: (e: React.PointerEvent) => {
          if (e.pointerType === "touch") return;
          hide();
        },
        onClick: (e) => {
          // Only toggle on touch; mouse is handled by hover
          if (lastPointerType.current !== "touch") return;
          if (visibleRef.current) {
            hide();
          } else {
            show(resolve(e as unknown as React.MouseEvent), e, placement);
          }
        },
        onFocus: (e) => {
          const target = e.currentTarget as HTMLElement;
          const r = target.getBoundingClientRect();
          show(
            resolve(e),
            { clientX: r.left + r.width / 2, clientY: r.top },
            placement,
          );
        },
        onBlur: () => hide(),
      };
    },
    [show, move, hide],
  );

  useEffect(() => {
    setMounted(true);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const Portal = useCallback(() => {
    if (!mounted || typeof document === "undefined") return null;
    const state = stateRef.current;
    const noMotion = reducedMotion();
    return createPortal(
      <div
        ref={tipRef}
        role="tooltip"
        aria-hidden={!state.visible}
        className={cn(
          "pointer-events-none fixed z-[60] select-none",
          "text-foreground text-[12px] leading-snug",
          "rounded-xl border border-hairline",
          "bg-glass backdrop-blur-xl",
          "shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
          !noMotion && "transition-[opacity,transform] duration-150 ease-out",
          state.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1",
        )}
        style={{
          left: state.x,
          top: state.y,
          minWidth: TIP_MIN_WIDTH,
          maxWidth: `min(calc(100vw - 1.5rem), ${TIP_MAX_WIDTH}px)`,
        }}
      >
        {state.accent && (
          <div
            className="absolute inset-y-2 left-0 w-[2px] rounded-full"
            style={{ background: state.accent }}
            aria-hidden
          />
        )}
        <div className="px-3.5 py-2.5">
          {state.title && (
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground tracking-tight">
              {state.accent && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: state.accent }}
                  aria-hidden
                />
              )}
              <span className="truncate">{state.title}</span>
            </div>
          )}
          <div
            className={cn(
              "text-[12px] text-subtle",
              state.title ? "mt-1.5" : "",
            )}
          >
            {state.body}
          </div>
          {state.footer && (
            <div className="mt-2 pt-2 border-t border-hairline text-[11px] text-faint">
              {state.footer}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }, [mounted]);

  return { show, move, hide, bindTarget, Portal };
}

/* ==================================================================
   Tip body helpers — rows, bars, kbd-style chips. Lets each chart
   assemble dense deeper-stat tooltips without hand-rolling layout.
   ================================================================== */

export function TipRow({
  label,
  value,
  accent,
  muted,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          muted ? "text-faint" : "text-subtle",
        )}
      >
        {accent && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accent }}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          muted ? "text-subtle" : "text-foreground font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function TipBar({
  pct,
  color = "#0a84ff",
}: {
  pct: number;
  color?: string;
}) {
  const w = clamp(pct, 0, 100);
  // Draw-in: render at width 0, then flip to the real width on the next frame so
  // the CSS width transition plays whenever the tip opens. Reduced-motion users
  // mount straight at full width (no transition, no rAF flip).
  const [drawn, setDrawn] = useState(reducedMotion());
  useEffect(() => {
    if (drawn) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [drawn]);
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-overlay">
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: drawn ? `${w}%` : 0, background: color, opacity: 0.85 }}
      />
    </div>
  );
}

export function TipChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const toneClass = {
    neutral: "bg-overlay-strong text-subtle",
    good: "bg-[#30d158]/15 text-[#30d158]",
    bad: "bg-[#ff453a]/15 text-[#ff453a]",
    warn: "bg-[#ff9f0a]/15 text-[#ff9f0a]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] tracking-tight tabular-nums",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

/* ==================================================================
   useTiltHover — subtle 3D tilt + scale on tile hover. Cheap, GPU-
   only (transform). Skip on prefers-reduced-motion.
   ================================================================== */

export function useTiltHover<T extends HTMLElement>(opts?: {
  maxTilt?: number;
  scale?: number;
}) {
  const ref = useRef<T | null>(null);
  const idRef = useRef<string>(useId());
  const max = opts?.maxTilt ?? 4;
  const scale = opts?.scale ?? 1.005;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) return;

    let raf: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = (lastX - cx) / (r.width / 2);
        const dy = (lastY - cy) / (r.height / 2);
        const rx = clamp(-dy * max, -max, max);
        const ry = clamp(dx * max, -max, max);
        el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
      });
    };
    const onLeave = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      el.style.transform =
        "perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)";
    };
    const onEnter = () => {
      el.style.transition = "transform 120ms ease-out";
      el.style.willChange = "transform";
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [max, scale]);

  // attribute keeps multiple instances unique for inspection
  return { ref, "data-tilt-id": idRef.current } as const;
}

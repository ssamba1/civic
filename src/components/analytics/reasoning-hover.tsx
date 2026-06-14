"use client";

import { Loader2 } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  ReasoningResponse,
  ReasoningSection,
} from "@/app/api/ai/reasoning/route";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Reasoning hover card — portal-rendered, anchored to a report row.

   Compact summary: one cost line + 3-4 bullet highlights pulled from
   the scoring sections. Opens to the LEFT of the row (the report rail
   hugs the right edge) and clamps inside the viewport.

   Data comes from /api/ai/reasoning, which is synchronous and
   deterministic, so a per-report cache makes re-hover instant.
   ================================================================== */

const CARD_WIDTH = 340;
const OFFSET = 12;
const HOVER_INTENT_MS = 140;

// Indices in scoringExplanation that summarize the row best.
const BULLET_INDICES = [0, 2, 3, 4] as const;

function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : s).trim();
}

interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

interface ActiveTarget {
  id: string;
  label: string;
  anchor: Anchor;
}

export interface ReasoningHoverHandlers {
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerLeave: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
}

interface UseReasoningHoverReturn {
  bindReport: (report: {
    id: string;
    label: string;
    demo?: boolean;
    ai_reasoning?: string;
  }) => ReasoningHoverHandlers;
  Portal: () => ReactNode;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function reducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function CardBody({ data }: { data: ReasoningResponse }) {
  const costLine = data.costBreakdown[0]?.value ?? "";
  const bullets = BULLET_INDICES.map((i) => data.scoringExplanation[i]).filter(
    (s): s is ReasoningSection => Boolean(s),
  );

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Cost
        </span>
        <p className="text-[12px] leading-snug text-zinc-200">{costLine}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {bullets.map((b) => (
          <li
            key={b.title}
            className="flex gap-2 text-[12px] leading-snug text-zinc-300"
          >
            <span
              aria-hidden
              className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-500"
            />
            <span>
              <span className="text-zinc-100">{b.title}:</span>{" "}
              <span className="text-zinc-400">{firstSentence(b.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function useReasoningHover(): UseReasoningHoverReturn {
  const [target, setTarget] = useState<ActiveTarget | null>(null);
  const [data, setData] = useState<ReasoningResponse | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: -9999,
    y: -9999,
  });
  const [mounted, setMounted] = useState(false);

  // Latest state mirrored into refs so Portal can keep a stable identity
  // (deps: [mounted]) yet still render the current value. JSX uses <Portal/>;
  // a changing function reference would remount the whole portal tree on every
  // position or data update, restarting the fade-in transition.
  const targetRef = useRef(target);
  targetRef.current = target;
  const dataRef = useRef(data);
  dataRef.current = data;
  const fetchErrorRef = useRef(fetchError);
  fetchErrorRef.current = fetchError;
  const posRef = useRef(pos);
  posRef.current = pos;

  const cache = useRef<Map<string, ReasoningResponse>>(new Map());
  const cardRef = useRef<HTMLDivElement | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  // The id we are actively showing — guards against a slow fetch resolving
  // after the user has moved on to a different row.
  const activeId = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (intentTimer.current) clearTimeout(intentTimer.current);
      fetchController.current?.abort();
    };
  }, []);

  const ensureData = useCallback(
    (id: string, demo?: boolean, ai_reasoning?: string) => {
      // Demo report: skip the network call, return baked data instantly.
      if (demo && ai_reasoning) {
        const baked: ReasoningResponse = {
          reportId: id,
          reasoning: ai_reasoning,
          costBreakdown: [
            { title: "Chainsaw crew (2 workers, 1 hr)", value: "$220" },
            { title: "Wood chipper + debris hauling", value: "$125" },
            { title: "Hazard cones + safety tape", value: "$15" },
            { title: "Estimated total", value: "$360" },
          ],
          scoringExplanation: [
            {
              title: "Severity",
              value: "3 / 5 — property access blocked, no injury risk",
            },
            { title: "Confidence", value: "93%" },
            { title: "Priority score", value: "72 / 100" },
            { title: "SLA target", value: "< 48 hours" },
          ],
        };
        cache.current.set(id, baked);
        setData(baked);
        return;
      }
      const cached = cache.current.get(id);
      if (cached) {
        setData(cached);
        return;
      }
      setData(null); // loading
      setFetchError(false);
      fetchController.current?.abort();
      const controller = new AbortController();
      fetchController.current = controller;
      fetch("/api/ai/reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: id }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((json: ReasoningResponse) => {
          cache.current.set(id, json);
          if (activeId.current === id) setData(json);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          // Surface real errors so the Portal can show a retry state instead of
          // leaving an infinite spinner.
          if (activeId.current === id) setFetchError(true);
        });
    },
    [],
  );

  const open = useCallback(
    (
      report: {
        id: string;
        label: string;
        demo?: boolean;
        ai_reasoning?: string;
      },
      rect: DOMRect,
    ) => {
      activeId.current = report.id;
      setTarget({
        id: report.id,
        label: report.label,
        anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
      });
      ensureData(report.id, report.demo, report.ai_reasoning);
    },
    [ensureData],
  );

  const close = useCallback(() => {
    if (intentTimer.current) {
      clearTimeout(intentTimer.current);
      intentTimer.current = null;
    }
    activeId.current = null;
    setTarget(null);
  }, []);

  const lastReportPtrType = useRef<string>("mouse");

  // Chrome fires pointerenter for an element that merely renders under a
  // stationary cursor (e.g. on page load), popping the card with no user
  // intent. Ignore hover until the pointer has actually moved.
  const pointerHasMoved = useRef(false);
  useEffect(() => {
    const markMoved = () => {
      pointerHasMoved.current = true;
      window.removeEventListener("pointermove", markMoved);
    };
    window.addEventListener("pointermove", markMoved, { passive: true });
    return () => window.removeEventListener("pointermove", markMoved);
  }, []);

  const bindReport: UseReasoningHoverReturn["bindReport"] = useCallback(
    (report) => ({
      onPointerEnter: (e) => {
        lastReportPtrType.current = e.pointerType;
        // Touch: don't show on hover-enter — wait for explicit tap (onClick)
        if (e.pointerType === "touch") return;
        if (!pointerHasMoved.current) return;
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (intentTimer.current) clearTimeout(intentTimer.current);
        intentTimer.current = setTimeout(
          () => open(report, rect),
          HOVER_INTENT_MS,
        );
      },
      onPointerLeave: () => {
        // Touch: don't dismiss on pointer-leave
        if (lastReportPtrType.current === "touch") return;
        close();
      },
      onClick: (e: React.MouseEvent) => {
        // Touch tap: toggle the card
        if (lastReportPtrType.current !== "touch") return;
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (activeId.current === report.id) {
          close();
        } else {
          if (intentTimer.current) clearTimeout(intentTimer.current);
          open(report, rect);
        }
      },
      onFocus: (e) => {
        // Only open on explicit keyboard focus — relatedTarget is null when focus
        // moves from outside the document (page load, programmatic .focus()) which
        // was causing the popover to auto-open on analytics page load.
        if (!e.relatedTarget) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        open(report, rect);
      },
      onBlur: close,
    }),
    [open, close],
  );

  // Position after the card has measured itself; reposition on resize, and
  // dismiss on scroll so the card never floats away from its row.
  useLayoutEffect(() => {
    if (!target || typeof window === "undefined") return;
    const place = () => {
      const card = cardRef.current;
      const h = card?.offsetHeight ?? 360;
      const w = card?.offsetWidth ?? CARD_WIDTH;
      const vh = window.innerHeight;
      // Open left of the row; clamp into the viewport.
      const x = clamp(
        target.anchor.left - OFFSET - w,
        8,
        window.innerWidth - w - 8,
      );
      // Vertically center on the row, then clamp.
      const mid = (target.anchor.top + target.anchor.bottom) / 2;
      const y = clamp(mid - h / 2, 8, vh - h - 8);
      setPos({ x, y });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", close, true);
    };
  }, [target, data, close]);

  const Portal = useCallback(() => {
    if (!mounted || typeof document === "undefined") return null;
    const target = targetRef.current;
    const data = dataRef.current;
    const hasFetchError = fetchErrorRef.current;
    const pos = posRef.current;
    const visible = target !== null;
    const noMotion = reducedMotion();
    return createPortal(
      <div
        ref={cardRef}
        role="tooltip"
        aria-hidden={!visible}
        className={cn(
          "pointer-events-none fixed z-[60] select-none",
          "rounded-2xl border border-white/[0.08]",
          "bg-[rgba(18,18,22,0.94)] backdrop-blur-xl",
          "shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
          !noMotion && "transition-[opacity,transform] duration-150 ease-out",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
        )}
        style={{
          left: pos.x,
          top: pos.y,
          width: CARD_WIDTH,
          maxWidth: "min(calc(100vw - 1.5rem), 340px)",
          maxHeight: "calc(100dvh - 1.5rem)",
          overflowY: "auto",
        }}
      >
        {target && (
          <>
            <header className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-[14px] font-semibold tracking-tight text-white">
                  Reasoning
                </h3>
                <span className="truncate text-[12px] text-zinc-400">
                  {target.label}
                </span>
              </div>
              <span className="flex-shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                AI estimate
              </span>
            </header>
            {data ? (
              <CardBody data={data} />
            ) : hasFetchError ? (
              <div className="flex flex-col h-24 items-center justify-center gap-2 px-4">
                <p className="text-[12px] text-zinc-400">
                  Failed to load reasoning.
                </p>
                <button
                  type="button"
                  className="pointer-events-auto text-[11px] text-zinc-300 underline underline-offset-2 hover:text-white"
                  onClick={() => {
                    const t = targetRef.current;
                    if (t) ensureData(t.id);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}
          </>
        )}
      </div>,
      document.body,
    );
  }, [mounted, ensureData]);

  return { bindReport, Portal };
}

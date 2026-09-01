"use client";

import { useCallback, useEffect, useState } from "react";

/* ==================================================================
   Callout layer for the page guide.

   Anchors to REAL elements: every callout names a `data-tour` key and
   the layer resolves it with `document.querySelector` at open time.
   A key that resolves to nothing — different data, a collapsed panel,
   a viewport too narrow to render that column — is dropped silently,
   so an arrow never points into empty space.

   Geometry is measured once per open and re-measured on resize. The
   dialog locks body scroll while it is open, so measured rects cannot
   drift underneath the drawing.
   ================================================================== */

/** Gap between a target's ring and its label chip. */
const GAP = 14;
/** Label chips are a fixed height so leader-line geometry is exact. */
const LABEL_H = 28;
/** Viewport inset every drawn element is clamped inside. */
const PAD = 10;
/** Breathing room between the target's box and its ring. */
const RING_PAD = 6;
const RING_RADIUS = 9;
/** Below this, an element is treated as collapsed/hidden rather than drawn. */
const MIN_TARGET = 10;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Spot {
  /** Index into the guide's point list — the number shown in both places. */
  index: number;
  label: string;
  ring: Box;
  chip: Box;
  line: { x1: number; y1: number; x2: number; y2: number };
}

function intersects(a: Box, b: Box | null): boolean {
  if (!b) return false;
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Chips are rendered at exactly this width, so the estimate is the truth. */
function chipWidth(label: string): number {
  return Math.min(248, Math.max(132, 46 + label.length * 6.7));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * The LAYOUT viewport, not the visual one. The app scales the root element
 * (`html { zoom }`), so `window.innerWidth/Height` are the unscaled device
 * numbers while `getBoundingClientRect` — and this overlay, which lives in
 * the same scaled tree — speak the scaled coordinate space. Mixing the two
 * clips rings early and drops callouts near the right and bottom edges.
 */
function viewport(): { vw: number; vh: number } {
  if (typeof document === "undefined") return { vw: 0, vh: 0 };
  const el = document.documentElement;
  return { vw: el.clientWidth, vh: el.clientHeight };
}

/**
 * Places a chip beside its ring: right, then left, then above, then below,
 * then inside the ring's own top-left corner. Everything is confined to the
 * band the guide panel leaves free, so a chip is never drawn under it.
 * Nothing fits → the callout is dropped rather than fudged.
 */
function place(
  ring: Box,
  w: number,
  bandLeft: number,
  bandRight: number,
  vh: number,
  panel: Box | null,
  placed: Box[],
): { chip: Box; line: Spot["line"] } | null {
  const midY = clamp(
    ring.y + ring.h / 2 - LABEL_H / 2,
    PAD,
    Math.max(PAD, vh - LABEL_H - PAD),
  );
  const midX = clamp(
    ring.x + ring.w / 2 - w / 2,
    bandLeft,
    Math.max(bandLeft, bandRight - w),
  );
  const ringCx = ring.x + ring.w / 2;
  const ringCy = ring.y + ring.h / 2;

  const candidates: { chip: Box; line: Spot["line"] }[] = [
    {
      chip: { x: ring.x + ring.w + GAP, y: midY, w, h: LABEL_H },
      line: {
        x1: ring.x + ring.w + GAP,
        y1: midY + LABEL_H / 2,
        x2: ring.x + ring.w,
        y2: ringCy,
      },
    },
    {
      chip: { x: ring.x - GAP - w, y: midY, w, h: LABEL_H },
      line: {
        x1: ring.x - GAP,
        y1: midY + LABEL_H / 2,
        x2: ring.x,
        y2: ringCy,
      },
    },
    {
      chip: { x: midX, y: ring.y - GAP - LABEL_H, w, h: LABEL_H },
      line: {
        x1: midX + w / 2,
        y1: ring.y - GAP,
        x2: ringCx,
        y2: ring.y,
      },
    },
    {
      chip: { x: midX, y: ring.y + ring.h + GAP, w, h: LABEL_H },
      line: {
        x1: midX + w / 2,
        y1: ring.y + ring.h + GAP,
        x2: ringCx,
        y2: ring.y + ring.h,
      },
    },
  ];

  const fits = (c: { chip: Box }) =>
    c.chip.x >= bandLeft &&
    c.chip.x + c.chip.w <= bandRight &&
    c.chip.y >= PAD &&
    c.chip.y + c.chip.h <= vh - PAD &&
    !intersects(c.chip, panel) &&
    !intersects(c.chip, ring);

  // First pass prefers a chip that also clears every ring already drawn —
  // page sections nest, so without this the chips pile onto each other.
  for (const c of candidates) {
    if (!fits(c)) continue;
    if (placed.some((p) => intersects(c.chip, p))) continue;
    return c;
  }
  for (const c of candidates) {
    if (fits(c)) return c;
  }

  // Nothing fits beside it — most page sections are as wide as the content
  // column, so there is no outside. Sit the chip in the ring's top-left
  // corner instead, with no leader line: it is already touching its subject.
  if (ring.w > w + 24 && ring.h > LABEL_H + 24) {
    const chip = { x: ring.x + 10, y: ring.y + 10, w, h: LABEL_H };
    if (
      chip.x >= bandLeft &&
      chip.x + w <= bandRight &&
      !intersects(chip, panel)
    ) {
      const cx = chip.x;
      const cy = chip.y + LABEL_H / 2;
      return { chip, line: { x1: cx, y1: cy, x2: cx, y2: cy } };
    }
  }
  return null;
}

export interface CalloutTarget {
  /** `data-tour` value on the page element this callout points at. */
  target?: string;
  label: string;
}

/**
 * Measures every resolvable callout. Returns only the ones that were found,
 * are large enough to ring, sit inside the viewport, and have room for a
 * chip that clears the guide panel.
 */
export function measureSpots(
  points: CalloutTarget[],
  panel: Box | null,
): Spot[] {
  if (typeof document === "undefined") return [];
  const { vw, vh } = viewport();
  const spots: Spot[] = [];

  // The horizontal band the panel leaves free. Everything is drawn inside it,
  // so a ring never runs off under an opaque panel and no chip is orphaned.
  // Only carve a side band when the panel actually docks to a side. On a
  // narrow viewport it docks along the bottom instead, and the whole width
  // above it stays usable — the per-chip panel test keeps that honest.
  const sideDocked = !!panel && panel.w < vw * 0.6;
  const bandLeft =
    sideDocked && panel && panel.x < vw / 2 ? panel.x + panel.w + 14 : PAD;
  const bandRight =
    sideDocked && panel && panel.x >= vw / 2 ? panel.x - 14 : vw - PAD;

  points.forEach((point, i) => {
    if (!point.target) return;
    let el: Element | null = null;
    try {
      el = document.querySelector(`[data-tour="${CSS.escape(point.target)}"]`);
    } catch {
      el = null;
    }
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (r.width < MIN_TARGET || r.height < MIN_TARGET) return;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;

    // Most page sections run the full content width, so they pass under the
    // docked panel. Clip the ring into the free band rather than dropping it
    // — a ring that runs off under an opaque panel reads as broken. An
    // element that lies wholly behind the panel is dropped: there is nothing
    // visible left to point at.
    const x = clamp(r.left - RING_PAD, bandLeft, bandRight);
    const y = clamp(r.top - RING_PAD, PAD, vh - PAD);
    const w = clamp(r.right + RING_PAD, bandLeft, bandRight) - x;
    const h = clamp(r.bottom + RING_PAD, PAD, vh - PAD) - y;
    if (w < MIN_TARGET || h < MIN_TARGET) return;

    const ring: Box = { x, y, w, h };
    const seated = place(
      ring,
      chipWidth(point.label),
      bandLeft,
      bandRight,
      vh,
      panel,
      spots.map((sp) => sp.ring),
    );
    if (!seated) return;

    spots.push({ index: i, label: point.label, ring, ...seated });
  });

  return spots;
}

/**
 * Re-measures on open and on resize. `deps` re-runs measurement when the
 * guide switches pages or the panel finishes laying out.
 */
export function useSpots(
  open: boolean,
  points: CalloutTarget[],
  panelRect: () => Box | null,
): Spot[] {
  const [spots, setSpots] = useState<Spot[]>([]);

  const remeasure = useCallback(() => {
    setSpots(measureSpots(points, panelRect()));
  }, [points, panelRect]);

  useEffect(() => {
    if (!open) {
      setSpots([]);
      return;
    }
    // Two frames: one for the panel to lay out, one for its final rect.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(remeasure);
    });
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, [open, remeasure]);

  return spots;
}

/**
 * Draws the spotlight scrim, the rings, the leader lines and the numbered
 * chips. Purely presentational and `pointer-events-none` throughout — the
 * dialog owns the click-to-close scrim underneath it.
 */
export function CalloutOverlay({
  spots,
  active,
}: {
  spots: Spot[];
  /** Point index the user is hovering in the panel; dims the others. */
  active: number | null;
}) {
  const { vw, vh } = viewport();

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" role="presentation">
        <title>Page guide callouts</title>
        <defs>
          <mask id="civic-guide-spotlight">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {spots.map((s) => (
              <rect
                key={`hole-${s.index}`}
                x={s.ring.x}
                y={s.ring.y}
                width={s.ring.w}
                height={s.ring.h}
                rx={RING_RADIUS}
                fill="black"
              />
            ))}
          </mask>
        </defs>

        {/* Wash the page toward its own background so the rung-out targets
            read as the subject. Token-driven, so it inverts with the theme. */}
        <rect
          x="0"
          y="0"
          width={vw}
          height={vh}
          className="fill-[color-mix(in_srgb,var(--background)_76%,transparent)]"
          mask="url(#civic-guide-spotlight)"
        />

        {spots.map((s) => {
          const dim = active !== null && active !== s.index;
          // A chip sitting inside its own ring needs no leader line.
          const leader =
            Math.hypot(s.line.x2 - s.line.x1, s.line.y2 - s.line.y1) > 3;
          return (
            <g
              key={`spot-${s.index}`}
              style={{ opacity: dim ? 0.28 : 1 }}
              className="transition-opacity duration-200"
            >
              {/* Halo under the hairline ring keeps it legible on any fill. */}
              <rect
                x={s.ring.x}
                y={s.ring.y}
                width={s.ring.w}
                height={s.ring.h}
                rx={RING_RADIUS}
                fill="none"
                strokeWidth={5}
                className="stroke-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
              />
              <rect
                x={s.ring.x}
                y={s.ring.y}
                width={s.ring.w}
                height={s.ring.h}
                rx={RING_RADIUS}
                fill="none"
                strokeWidth={1.5}
                className="stroke-[var(--accent)]"
              />
              {leader && (
                <>
                  <line
                    x1={s.line.x1}
                    y1={s.line.y1}
                    x2={s.line.x2}
                    y2={s.line.y2}
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    className="stroke-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                  />
                  <circle
                    cx={s.line.x2}
                    cy={s.line.y2}
                    r={2.75}
                    className="fill-[var(--accent)]"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {spots.map((s) => {
        const dim = active !== null && active !== s.index;
        return (
          <div
            key={`chip-${s.index}`}
            style={{
              left: s.chip.x,
              top: s.chip.y,
              width: s.chip.w,
              height: s.chip.h,
              opacity: dim ? 0.3 : 1,
            }}
            className="absolute flex items-center gap-2 rounded-full border border-hairline-strong bg-surface px-2 pr-3 shadow-[var(--shadow-pop)] transition-opacity duration-200"
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-accent-contrast tabular-nums">
              {s.index + 1}
            </span>
            <span className="truncate text-[12px] font-medium text-foreground">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

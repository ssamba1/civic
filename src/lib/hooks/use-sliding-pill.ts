"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Sliding-pill indicator for variable-width segmented controls.
 *
 * Measures the active child (the one carrying `data-pill-active="true"`) inside
 * the returned `trackRef` and reports the geometry an absolutely-positioned
 * indicator should occupy. The indicator animates between segments via a CSS
 * transition on `transform` + `width`, so callers get a smooth slide without
 * any per-item width math, even when labels differ in length.
 *
 * Requirements on the caller:
 *   - put `ref={trackRef}` on the track element and make it `position: relative`
 *   - mark the active child with `data-pill-active="true"`
 *   - render an indicator span positioned with the returned `style`
 *
 * Re-measures on `activeKey` change and on track resize (ResizeObserver), so it
 * stays aligned across viewport changes and late web-font swaps.
 */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>(
  activeKey: string | number | undefined,
) {
  const trackRef = useRef<T | null>(null);
  const [pill, setPill] = useState<{
    left: number;
    width: number;
    ready: boolean;
  }>({ left: 0, width: 0, ready: false });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const active = track.querySelector<HTMLElement>(
      '[data-pill-active="true"]',
    );
    if (!active) {
      setPill((p) => ({ ...p, ready: false }));
      return;
    }
    setPill({
      left: active.offsetLeft,
      width: active.offsetWidth,
      ready: true,
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey is an intentional extra dep. Not read in the body, but it re-runs measure() so the pill re-aligns when the active segment changes
  useLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure, activeKey]);

  return { trackRef, pill };
}

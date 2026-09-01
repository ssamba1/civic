import { type RefObject, useEffect } from "react";

// Reactive 3D tilt, tracks pointer over the element, rotates a perspective
// transform toward the cursor. rAF-throttled, applies styles directly to the
// DOM node (no React re-renders per frame). Ported VERBATIM from Riven.
export default function useMouseTilt(
  ref: RefObject<HTMLElement | null>,
  opts: {
    max?: number;
    scale?: number;
    perspective?: number;
    glare?: boolean;
    damping?: number;
    enabled?: boolean;
  } = {},
) {
  const {
    max = 8,
    scale = 1.015,
    perspective = 900,
    glare = true,
    damping = 0.18,
    enabled = true,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;

    const state = {
      rx: 0,
      ry: 0,
      tx: 0,
      ty: 0,
      sx: 1,
      ts: 1,
      raf: 0,
      active: false,
    };

    const apply = () => {
      state.rx += (state.tx - state.rx) * damping;
      state.ry += (state.ty - state.ry) * damping;
      state.sx += (state.ts - state.sx) * damping;

      el.style.transform =
        `perspective(${perspective}px) ` +
        `rotateX(${state.rx.toFixed(3)}deg) ` +
        `rotateY(${state.ry.toFixed(3)}deg) ` +
        `scale(${state.sx.toFixed(4)})`;

      const stillMoving =
        Math.abs(state.tx - state.rx) > 0.01 ||
        Math.abs(state.ty - state.ry) > 0.01 ||
        Math.abs(state.ts - state.sx) > 0.0005;

      if (stillMoving) {
        state.raf = requestAnimationFrame(apply);
      } else {
        state.raf = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const nx = px * 2 - 1;
      const ny = py * 2 - 1;
      state.ty = nx * max;
      state.tx = -ny * max;
      state.ts = scale;
      if (glare) {
        el.style.setProperty("--mx", `${(px * 100).toFixed(2)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(2)}%`);
      }
      if (!state.raf) state.raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      state.tx = 0;
      state.ty = 0;
      state.ts = 1;
      if (!state.raf) state.raf = requestAnimationFrame(apply);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.style.willChange = "transform";
    el.style.transformStyle = "preserve-3d";

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (state.raf) cancelAnimationFrame(state.raf);
      el.style.transform = "";
      el.style.willChange = "";
    };
  }, [ref, max, scale, perspective, glare, damping, enabled]);
}

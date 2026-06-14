"use client";

import { useEffect, useRef } from "react";

/**
 * Hero wave background — ported from peregryne.vercel.app's live hero canvas.
 * It is a domain-warped plasma: an iterative sin/cos warp evaluated per pixel
 * at reduced resolution (1/`scale`, default 1/3), then nearest-neighbour
 * upscaled for a soft silky field. Deep-navy base → light-blue highlight
 * (Civic blue). Canvas2D, pointer-events none, behind the hero content;
 * animates continuously (pauses only when scrolled offscreen via
 * IntersectionObserver, capped at 30fps).
 *
 * All visual params are live: speed/intensity/tint/contrast/paused are read
 * from a ref each frame, so the WaveTweaks panel can change them without
 * tearing down the canvas. Only `scale` (which resizes the pixel buffer)
 * re-initialises the effect.
 */

const FRAME = 1000 / 30; // 30fps cap
const LUT = 1024;

// Base (deep navy) — close to the hero section bg so it blends seamlessly.
const BASE = [4, 8, 20] as const;

export interface WaveParams {
  speed: number;
  intensity: number;
  /** 0 = brightest light-blue highlight → 1 = deep blue. */
  tint: number;
  /** Wave definition. <1 washes out, >1.45 sharpens crests. */
  contrast: number;
  /** Pixel scale: render at 1/scale res then upscale. Lower = sharper + heavier. */
  scale: number;
  paused: boolean;
}

export const DEFAULT_WAVE: WaveParams = {
  speed: 0.9,
  intensity: 1,
  tint: 0,
  contrast: 1.45,
  scale: 3,
  paused: false,
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// Highlight colour ramp by `tint` (0 = brightest light-blue → 1 = deep blue).
function ramp(t: number): [number, number, number] {
  if (t <= 0.5) {
    const k = t * 2;
    return [lerp(40, 20, k), lerp(145, 80, k), lerp(255, 200, k)];
  }
  const k = (t - 0.5) * 2;
  return [lerp(95, 40, k), lerp(145, 70, k), lerp(215, 160, k)];
}

export function WaveHero({
  speed = DEFAULT_WAVE.speed,
  intensity = DEFAULT_WAVE.intensity,
  tint = DEFAULT_WAVE.tint,
  contrast = DEFAULT_WAVE.contrast,
  scale = DEFAULT_WAVE.scale,
  paused = DEFAULT_WAVE.paused,
  className = "",
}: Partial<WaveParams> & { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live params the render loop reads each frame (avoids canvas re-init on tweak).
  const live = useRef<Omit<WaveParams, "scale">>({
    speed,
    intensity,
    tint,
    contrast,
    paused,
  });
  live.current = { speed, intensity, tint, contrast, paused };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Device detection lives ONLY in the effect (never in JSX/useState) so the
    // server + client render the same tree — no hydration mismatch.
    const isMobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Mobile: skip the per-pixel plasma loop entirely. The canvas stays
    // transparent and the static CSS gradient shows through — zero main-thread
    // cost, no scroll/tap jank. Nothing was scheduled, so no cleanup needed.
    if (isMobile) return;

    let bw = 0;
    let bh = 0;
    let img: ImageData | null = null;
    let data: Uint8ClampedArray | null = null;

    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
      bw = Math.max(1, Math.floor(canvas.width / scale));
      bh = Math.max(1, Math.floor(canvas.height / scale));
      img = ctx.createImageData(bw, bh);
      data = img.data;
    };
    resize();

    // sin/cos lookup tables for the per-pixel inner loop
    const SIN = new Float32Array(LUT);
    const COS = new Float32Array(LUT);
    for (let i = 0; i < LUT; i++) {
      const a = (i / LUT) * Math.PI * 2;
      SIN[i] = Math.sin(a);
      COS[i] = Math.cos(a);
    }
    const TAU = Math.PI * 2;
    const K = LUT / TAU; // radians → LUT index; integer index avoids modulo + floor in the hot loop
    const fsin = (x: number) => SIN[((x * K) | 0) & (LUT - 1)];
    const fcos = (x: number) => COS[((x * K) | 0) & (LUT - 1)];

    // Colour mapping baked into a 256-entry LUT (linear ce→colour) so the hot
    // per-pixel loop does zero lerp — just three array reads. Rebuilt only when
    // tint or contrast actually change (cheap 2-value guard per frame).
    const LR = new Uint8ClampedArray(256);
    const LG = new Uint8ClampedArray(256);
    const LB = new Uint8ClampedArray(256);
    let lutTint = NaN;
    let lutContrast = NaN;
    const buildLUT = () => {
      const { tint: ti, contrast: co } = live.current;
      if (ti === lutTint && co === lutContrast) return;
      lutTint = ti;
      lutContrast = co;
      const [hr, hg, hb] = ramp(ti);
      for (let i = 0; i < 256; i++) {
        let v = i / 255;
        v = (v - 0.5) * co + 0.5; // contrast → more defined waves, less grey midtone
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        LR[i] = BASE[0] + (hr - BASE[0]) * v;
        LG[i] = BASE[1] + (hg - BASE[1]) * v;
        LB[i] = BASE[2] + (hb - BASE[2]) * v;
      }
    };
    buildLUT();

    let raf = 0;
    let t = 0;
    let last = performance.now();
    let lastFrame = 0;
    let visible = true;

    const renderFrame = (time: number) => {
      if (!data || !img) return;
      buildLUT();
      const Lt = time;
      const Ie = live.current.intensity;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const nx = (2 * x - bw) / bh;
          const ny = (2 * y - bh) / bh;
          let he = 0;
          let fe = 0;
          for (let q = 0; q < 4; q++) {
            he += fcos(q - fe + Lt * 0.5 - he * nx);
            fe += fsin(q * ny + he);
          }
          const a = ((fsin(he) + fcos(fe)) * 0.5 + 1) * 0.5;
          const b = 0.5 + 0.5 * fcos(nx + ny + Lt * 0.3);
          let ce = a * b * Ie;
          ce = ce < 0 ? 0 : ce > 1 ? 1 : ce;
          const idx = (ce * 255) | 0;
          const o = (y * bw + x) * 4;
          data[o] = LR[idx];
          data[o + 1] = LG[idx];
          data[o + 2] = LB[idx];
          data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, bw, bh, 0, 0, canvas.width, canvas.height);
    };

    // Desktop + reduced-motion: render exactly ONE frozen plasma frame so the
    // texture is visible and intentional (a blank/gradient swap could read as
    // "broken"), then stop — never advance time, never schedule raf. No io /
    // resize listener was created, so no cleanup is required.
    if (reducedMotion) {
      renderFrame(0);
      return;
    }

    const loop = () => {
      const now = performance.now();
      const dt = (now - last) * 0.001;
      last = now;
      // Pause freezes time, but we keep rendering so tint/intensity/contrast
      // tweaks still reflect on the frozen frame.
      if (!live.current.paused) t += dt * live.current.speed;
      if (visible && now - lastFrame >= FRAME) {
        lastFrame = now;
        renderFrame(t);
      }
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      rootMargin: "200px",
    });
    io.observe(canvas);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    raf = requestAnimationFrame(loop);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      io.disconnect();
    };
  }, [scale]);

  return (
    <div
      aria-hidden="true"
      data-hero-bg="wave"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {/* Static gradient base — always present (hydration-safe, same server +
          client tree). Sits BEHIND the canvas (-z-10 paints below the in-flow
          block canvas). On mobile the JS loop never runs so the canvas stays
          transparent and this gradient is the hero background; on desktop the
          opaque plasma draws over it. Deep navy w/ a soft off-center
          light-blue (Civic) glow. */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 72% 22%, rgba(40,145,255,0.20), rgba(40,145,255,0.05) 38%, transparent 62%), linear-gradient(180deg,#060d1f,#040814)",
        }}
      />
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

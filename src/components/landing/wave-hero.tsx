"use client";

import { useEffect, useRef } from "react";

/**
 * Hero wave background — ported from peregryne.vercel.app's live hero canvas.
 * It is a domain-warped plasma: an iterative sin/cos warp evaluated per pixel
 * at 1/3 resolution, then nearest-neighbour upscaled for a soft silky field.
 * Deep-navy base → light-blue highlight (Civic blue). Faithful to the live
 * params (speed 1.2, intensity 1, tint 0). Canvas2D, pointer-events none,
 * behind the hero content; renders a single static frame under reduced-motion.
 */

const SCALE = 3; // render at 1/3 res, upscale (perf); definition comes from the contrast LUT
const FRAME = 1000 / 30; // 30fps cap
const LUT = 1024;

// Base (deep navy) — close to the hero section bg so it blends seamlessly.
const BASE = [4, 8, 20] as const;

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
  speed = 0.9,
  intensity = 1,
  tint = 0,
  className = "",
}: {
  speed?: number;
  intensity?: number;
  tint?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let bw = 0;
    let bh = 0;
    let img: ImageData | null = null;
    let data: Uint8ClampedArray | null = null;

    const resize = () => {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
      bw = Math.max(1, Math.floor(canvas.width / SCALE));
      bh = Math.max(1, Math.floor(canvas.height / SCALE));
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

    // Faithful peregryne colour mapping baked into a 256-entry LUT (linear ce→colour),
    // so the hot per-pixel loop does zero lerp — just three array reads.
    const [hr, hg, hb] = ramp(tint);
    const LR = new Uint8ClampedArray(256);
    const LG = new Uint8ClampedArray(256);
    const LB = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      v = (v - 0.5) * 1.45 + 0.5; // contrast → more defined waves, less grey midtone
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      LR[i] = BASE[0] + (hr - BASE[0]) * v;
      LG[i] = BASE[1] + (hg - BASE[1]) * v;
      LB[i] = BASE[2] + (hb - BASE[2]) * v;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    let lastFrame = 0;
    let visible = true;

    const renderFrame = (time: number) => {
      if (!data || !img) return;
      const Lt = time;
      const Ie = intensity;
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

    const loop = () => {
      const now = performance.now();
      const dt = (now - last) * 0.001;
      last = now;
      t += dt * speed;
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

    if (reduce) {
      renderFrame(2);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      io.disconnect();
    };
  }, [speed, intensity, tint]);

  return (
    <div
      aria-hidden="true"
      data-hero-bg="wave"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

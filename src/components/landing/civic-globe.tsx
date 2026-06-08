"use client";

import createGlobe, { type COBEOptions } from "cobe";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

const CITY_MARKERS: { location: [number, number]; size: number }[] = [
  { location: [34.2073, -84.1402], size: 0.12 },
  { location: [33.749, -84.388], size: 0.08 },
  { location: [40.7128, -74.006], size: 0.07 },
  { location: [37.7749, -122.4194], size: 0.06 },
  { location: [42.3601, -71.0589], size: 0.05 },
  { location: [38.9072, -77.0369], size: 0.06 },
  { location: [35.1495, -90.049], size: 0.05 },
  { location: [49.8951, -97.1384], size: 0.04 },
  { location: [51.5074, -0.1278], size: 0.05 },
  { location: [48.8566, 2.3522], size: 0.04 },
  { location: [52.52, 13.405], size: 0.04 },
  { location: [-33.8688, 151.2093], size: 0.04 },
];

const GLOBE_CONFIG: Omit<COBEOptions, "width" | "height" | "onRender"> = {
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.28,
  dark: 0,
  diffuse: 1.1,
  mapSamples: 16000,
  mapBrightness: 5.5,
  baseColor: [0.95, 0.96, 0.98],
  markerColor: [10 / 255, 132 / 255, 1],
  glowColor: [0.92, 0.94, 0.98],
  markers: CITY_MARKERS,
};

export function CivicGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const pointerDownX = useRef<number | null>(null);
  const pointerMovement = useRef(0);
  const deltaRef = useRef(0);

  const onRender = useCallback((state: Record<string, number>) => {
    if (pointerDownX.current === null) phiRef.current += 0.0028;
    state.phi = phiRef.current + deltaRef.current;
    state.width = widthRef.current * 2;
    state.height = widthRef.current * 2;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      widthRef.current = canvas.offsetWidth;
    };
    measure();
    window.addEventListener("resize", measure);

    const globe = createGlobe(canvas, {
      ...GLOBE_CONFIG,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      onRender,
    } as COBEOptions & { onRender: typeof onRender });

    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", measure);
    };
  }, [onRender]);

  return (
    <div className={cn("relative aspect-square w-full max-w-[min(80vw,720px)]", className)}>
      <canvas
        ref={canvasRef}
        className="size-full opacity-0 transition-opacity duration-700 [contain:layout_paint_size]"
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          pointerDownX.current = e.clientX - pointerMovement.current;
          (e.target as HTMLCanvasElement).style.cursor = "grabbing";
        }}
        onPointerUp={(e) => {
          pointerDownX.current = null;
          (e.target as HTMLCanvasElement).style.cursor = "grab";
        }}
        onPointerOut={() => {
          pointerDownX.current = null;
        }}
        onMouseMove={(e) => {
          if (pointerDownX.current !== null) {
            const d = e.clientX - pointerDownX.current;
            pointerMovement.current = d;
            deltaRef.current = d / 200;
          }
        }}
        onTouchMove={(e) => {
          if (pointerDownX.current !== null && e.touches[0]) {
            const d = e.touches[0].clientX - pointerDownX.current;
            pointerMovement.current = d;
            deltaRef.current = d / 100;
          }
        }}
      />
    </div>
  );
}

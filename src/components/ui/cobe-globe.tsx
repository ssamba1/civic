"use client";

import createGlobe from "cobe";
import { useCallback, useEffect, useRef } from "react";

interface Marker {
  id: string;
  location: [number, number];
  label: string;
}

interface Arc {
  id: string;
  from: [number, number];
  to: [number, number];
  label?: string;
}

interface GlobeProps {
  markers?: Marker[];
  arcs?: Arc[];
  className?: string;
  markerColor?: [number, number, number];
  baseColor?: [number, number, number];
  arcColor?: [number, number, number];
  glowColor?: [number, number, number];
  dark?: number;
  mapBrightness?: number;
  markerSize?: number;
  markerElevation?: number;
  arcWidth?: number;
  arcHeight?: number;
  speed?: number;
  theta?: number;
  diffuse?: number;
  mapSamples?: number;
  /** When > 0, scatter this many ambient markers that pop in, hold, fade, and respawn —
   *  making the globe look like it is being populated by incoming reports. */
  populate?: number;
}

type Ambient = {
  location: [number, number];
  birth: number;
  life: number;
  scale: number;
};

// Curated land coordinates (real cities) so ambient markers never land in the ocean.
// Weighted toward North America / Georgia, where Civic launches.
const LAND_POINTS: [number, number][] = [
  // Georgia cluster (Civic's launch region) — extra dense
  [34.21, -84.14],
  [34.07, -84.29],
  [34.02, -84.36],
  [33.95, -84.55],
  [33.92, -84.38],
  [34.0, -84.14],
  [34.05, -84.07],
  [33.75, -84.39],
  [33.96, -83.38],
  [34.3, -83.82],
  // United States
  [40.71, -74.0],
  [34.05, -118.24],
  [41.88, -87.63],
  [29.76, -95.37],
  [33.45, -112.07],
  [39.95, -75.16],
  [29.42, -98.49],
  [32.78, -96.8],
  [32.72, -117.16],
  [37.34, -121.89],
  [30.27, -97.74],
  [30.33, -81.66],
  [39.96, -83.0],
  [35.23, -80.84],
  [39.77, -86.16],
  [47.61, -122.33],
  [39.74, -104.99],
  [42.36, -71.06],
  [36.16, -86.78],
  [25.76, -80.19],
  [44.98, -93.27],
  [27.95, -82.46],
  [29.95, -90.07],
  [45.51, -122.68],
  [39.1, -94.58],
  [40.76, -111.89],
  [42.33, -83.05],
  [38.91, -77.04],
  [38.63, -90.2],
  [36.17, -115.14],
  // Canada / Mexico
  [43.65, -79.38],
  [45.5, -73.57],
  [49.28, -123.12],
  [51.05, -114.07],
  [19.43, -99.13],
  [20.67, -103.35],
  [25.69, -100.32],
  // Europe
  [51.51, -0.13],
  [48.86, 2.35],
  [52.52, 13.4],
  [40.42, -3.7],
  [41.9, 12.5],
  [52.37, 4.9],
  [48.21, 16.37],
  [52.23, 21.01],
  [59.33, 18.07],
  [38.72, -9.14],
  [53.35, -6.26],
  [50.45, 30.52],
  [41.01, 28.98],
  [37.98, 23.73],
  [48.14, 11.58],
  // Asia / Middle East
  [35.68, 139.69],
  [39.9, 116.4],
  [31.23, 121.47],
  [28.61, 77.21],
  [19.08, 72.88],
  [13.76, 100.5],
  [1.35, 103.82],
  [37.57, 126.98],
  [-6.21, 106.85],
  [14.6, 120.98],
  [25.2, 55.27],
  [22.32, 114.17],
  [24.86, 67.0],
  [21.03, 105.85],
  [24.71, 46.68],
  // South America
  [-23.55, -46.63],
  [-22.91, -43.17],
  [-34.6, -58.38],
  [-12.05, -77.04],
  [4.71, -74.07],
  [-33.45, -70.67],
  [10.48, -66.9],
  [-0.18, -78.47],
  // Africa
  [6.52, 3.38],
  [30.04, 31.24],
  [-26.2, 28.05],
  [-1.29, 36.82],
  [33.57, -7.59],
  [5.6, -0.19],
  [9.03, 38.74],
  [-33.92, 18.42],
  // Oceania
  [-33.87, 151.21],
  [-37.81, 144.96],
  [-36.85, 174.76],
];

function spawnLocation(): [number, number] {
  const p = LAND_POINTS[(Math.random() * LAND_POINTS.length) | 0];
  // small jitter (~16km) keeps it on land near the city but avoids exact repeats
  return [
    p[0] + (Math.random() - 0.5) * 0.3,
    p[1] + (Math.random() - 0.5) * 0.3,
  ];
}

function genAmbient(n: number, now: number): Ambient[] {
  const out: Ambient[] = [];
  for (let i = 0; i < n; i++) {
    const life = 5000 + Math.random() * 6000;
    // stagger births so specks keep popping in; many are already mid-life on load
    out.push({
      location: spawnLocation(),
      birth: now - Math.random() * life,
      life,
      scale: 0.7 + Math.random() * 0.6,
    });
  }
  return out;
}

// 0..1 size factor across a marker's life: quick ease-out pop-in, hold, fade out. -1 = expired.
function popFactor(t: number, a: Ambient): number {
  const p = (t - a.birth) / a.life;
  if (p < 0) return 0;
  if (p > 1) return -1;
  const grow = 0.14;
  const fade = 0.16;
  if (p < grow) {
    const k = p / grow;
    return 1 - (1 - k) ** 3;
  }
  if (p > 1 - fade) return (1 - p) / fade;
  return 1;
}

export function Globe({
  markers = [],
  arcs = [],
  className = "",
  markerColor = [0.3, 0.45, 0.85],
  baseColor = [1, 1, 1],
  arcColor = [0.3, 0.45, 0.85],
  glowColor = [0.94, 0.93, 0.91],
  dark = 0,
  mapBrightness = 10,
  markerSize = 0.025,
  markerElevation = 0.01,
  arcWidth = 0.5,
  arcHeight = 0.25,
  speed = 0.003,
  theta = 0.2,
  diffuse = 1.5,
  mapSamples = 16000,
  populate = 0,
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const velocity = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (pointerInteracting.current !== null) {
      const deltaX = e.clientX - pointerInteracting.current.x;
      const deltaY = e.clientY - pointerInteracting.current.y;
      dragOffset.current = { phi: deltaX / 300, theta: deltaY / 1000 };
      const now = Date.now();
      if (lastPointer.current) {
        const dt = Math.max(now - lastPointer.current.t, 1);
        const maxVelocity = 0.15;
        velocity.current = {
          phi: Math.max(
            -maxVelocity,
            Math.min(
              maxVelocity,
              ((e.clientX - lastPointer.current.x) / dt) * 0.3,
            ),
          ),
          theta: Math.max(
            -maxVelocity,
            Math.min(
              maxVelocity,
              ((e.clientY - lastPointer.current.y) / dt) * 0.08,
            ),
          ),
        };
      }
      lastPointer.current = { x: e.clientX, y: e.clientY, t: now };
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
      lastPointer.current = null;
    }
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    isPausedRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId: number;
    let phi = 0;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    let ambient: Ambient[] = [];
    let visible = true;

    // Pause expensive GPU work + marker rebuilds when the globe is scrolled offscreen.
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      rootMargin: "200px",
    });
    io.observe(canvas);

    function init() {
      const width = canvas.offsetWidth;
      if (width === 0 || globe) return;

      ambient =
        populate > 0
          ? genAmbient(
              isMobile ? Math.min(populate, 28) : populate,
              performance.now(),
            )
          : [];

      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width,
        height: width,
        phi: 0,
        theta,
        dark,
        diffuse,
        mapSamples: isMobile ? Math.min(mapSamples, 9000) : mapSamples,
        mapBrightness,
        baseColor,
        markerColor,
        glowColor,
        markerElevation,
        markers: markers.map((m) => ({
          location: m.location,
          size: markerSize,
          id: m.id,
        })),
        arcs: arcs.map((a) => ({
          from: a.from,
          to: a.to,
          id: a.id,
        })),
        arcColor,
        arcWidth,
        arcHeight,
        opacity: 0.7,
      });

      const ambientMax = markerSize * 0.85;
      function buildAmbientMarkers(): {
        location: [number, number];
        size: number;
      }[] {
        if (ambient.length === 0) return [];
        if (prefersReduced) {
          return ambient.map((a) => ({
            location: a.location,
            size: ambientMax * a.scale,
          }));
        }
        const t = performance.now();
        const out: { location: [number, number]; size: number }[] = [];
        for (const a of ambient) {
          let f = popFactor(t, a);
          if (f < 0) {
            // expired → respawn elsewhere so new specks keep populating the globe
            a.location = spawnLocation();
            a.birth = t;
            a.life = 5000 + Math.random() * 6000;
            a.scale = 0.7 + Math.random() * 0.6;
            f = 0;
          }
          if (f > 0.001)
            out.push({ location: a.location, size: ambientMax * a.scale * f });
        }
        return out;
      }

      function animate() {
        if (!visible) {
          // Offscreen: skip GPU work + marker rebuild, but keep the loop alive to resume.
          animationId = requestAnimationFrame(animate);
          return;
        }
        if (!isPausedRef.current) {
          phi += prefersReduced ? 0 : speed;
          if (
            Math.abs(velocity.current.phi) > 0.0001 ||
            Math.abs(velocity.current.theta) > 0.0001
          ) {
            phiOffsetRef.current += velocity.current.phi;
            thetaOffsetRef.current += velocity.current.theta;
            velocity.current.phi *= 0.95;
            velocity.current.theta *= 0.95;
          }
          const thetaMin = -0.4,
            thetaMax = 0.4;
          if (thetaOffsetRef.current < thetaMin) {
            thetaOffsetRef.current += (thetaMin - thetaOffsetRef.current) * 0.1;
          } else if (thetaOffsetRef.current > thetaMax) {
            thetaOffsetRef.current += (thetaMax - thetaOffsetRef.current) * 0.1;
          }
        }
        // biome-ignore lint/style/noNonNullAssertion: animate() is only invoked from init() after globe is assigned
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: theta + thetaOffsetRef.current + dragOffset.current.theta,
          dark,
          mapBrightness,
          markerColor,
          baseColor,
          arcColor,
          markerElevation,
          markers: [
            ...markers.map((m) => ({
              location: m.location,
              size: markerSize,
              id: m.id,
            })),
            ...buildAmbientMarkers(),
          ],
          arcs: arcs.map((a) => ({
            from: a.from,
            to: a.to,
            id: a.id,
          })),
        });
        animationId = requestAnimationFrame(animate);
      }
      animate();
      setTimeout(() => {
        if (canvas) canvas.style.opacity = "1";
      });
    }

    let ro: ResizeObserver | null = null;
    if (canvas.offsetWidth > 0) {
      init();
    } else {
      ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro?.disconnect();
          ro = null;
          init();
        }
      });
      ro.observe(canvas);
    }

    return () => {
      ro?.disconnect();
      io.disconnect();
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    markers,
    arcs,
    markerColor,
    baseColor,
    arcColor,
    glowColor,
    dark,
    mapBrightness,
    markerSize,
    markerElevation,
    arcWidth,
    arcHeight,
    speed,
    theta,
    diffuse,
    mapSamples,
    populate,
  ]);

  return (
    <div
      className={`relative aspect-square select-none overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%",
          touchAction: "none",
          WebkitTouchCallout: "none",
        }}
      />
      {markers.map((m) => (
        <div
          key={m.id}
          style={{
            position: "absolute",
            positionAnchor: `--cobe-${m.id}`,
            bottom: "anchor(top)",
            left: "anchor(center)",
            translate: "-50% 0",
            marginBottom: 8,
            padding: "2px 6px",
            background: "#1a1a2e",
            color: "#fff",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            whiteSpace: "nowrap" as const,
            pointerEvents: "none" as const,
            opacity: `var(--cobe-visible-${m.id}, 0)`,
            filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 8px))`,
            transition: "opacity 0.8s, filter 0.8s",
          }}
        >
          {m.label}
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translate3d(-50%, -1px, 0)",
              border: "5px solid transparent",
              borderTopColor: "#1a1a2e",
            }}
          />
        </div>
      ))}
      {arcs
        .filter((a) => a.label)
        .map((a) => (
          <div
            key={a.id}
            style={{
              position: "absolute",
              positionAnchor: `--cobe-arc-${a.id}`,
              bottom: "anchor(top)",
              left: "anchor(center)",
              translate: "-50% 0",
              marginBottom: 8,
              padding: "2px 6px",
              background: "#fff",
              color: "#1a1a2e",
              fontFamily: "monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              pointerEvents: "none" as const,
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              opacity: `var(--cobe-visible-arc-${a.id}, 0)`,
              filter: `blur(calc((1 - var(--cobe-visible-arc-${a.id}, 0)) * 8px))`,
              transition: "opacity 0.8s, filter 0.8s",
            }}
          >
            {a.label}
            <span
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translate3d(-50%, -1px, 0)",
                border: "5px solid transparent",
                borderTopColor: "#fff",
              }}
            />
          </div>
        ))}
    </div>
  );
}

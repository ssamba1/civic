"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import useMouseTilt from "./useMouseTilt";

// Scroll-driven flatten: starts at `tilt` deg, lands at 0 deg as it docks in
// viewport. Ported VERBATIM from Riven WaitlistContainerScroll.jsx.
export default function WaitlistContainerScroll({
  children,
  tilt = 32,
  hoverTilt = 0,
}: {
  children?: ReactNode;
  tilt?: number;
  hoverTilt?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "start 0.22"],
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const scaleDims = isMobile ? [0.85, 1] : [0.95, 1];

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 26,
    mass: 0.35,
    restDelta: 0.001,
  });

  const rotate = useTransform(smoothProgress, [0, 1], [tilt, 0]);
  const scale = useTransform(smoothProgress, [0, 1], scaleDims);

  const innerRef = useRef<HTMLDivElement>(null);
  const hoverEnabled = hoverTilt > 0;
  useMouseTilt(innerRef, {
    max: hoverEnabled ? hoverTilt : 0,
    scale: 1,
    perspective: 1600,
    damping: 0.16,
    glare: false,
    enabled: hoverEnabled,
  });

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        position: "relative",
        paddingBottom: 64,
      }}
    >
      <div
        style={{
          width: "100%",
          position: "relative",
          perspective: "1200px",
          contain: "layout",
          paddingLeft: "clamp(24px, 4vw, 80px)",
          paddingRight: "clamp(24px, 4vw, 80px)",
        }}
      >
        <motion.div
          style={{
            rotateX: rotate,
            scale,
            boxShadow:
              "0 30px 60px -20px rgba(0,0,0,0.55), 0 100px 90px -40px rgba(0,0,0,0.35)",
            background: "rgb(var(--wl-surface-rgb, 17 17 19))",
            transformOrigin: "center top",
            willChange: "transform",
            transformStyle: "preserve-3d",
            backfaceVisibility: "hidden",
            maxWidth: "var(--wl-showcase-max-w, 1280px)",
            margin: "0 auto",
            width: "100%",
            borderRadius: "var(--wl-showcase-radius, 24px)",
          }}
        >
          <div
            ref={innerRef}
            style={{
              width: "100%",
              overflow: "hidden",
              borderRadius: "var(--wl-showcase-radius, 24px)",
              background: "rgb(var(--wl-bg-rgb, 10 10 11))",
              position: "relative",
            }}
          >
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

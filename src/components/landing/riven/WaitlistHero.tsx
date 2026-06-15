"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ShaderHero } from "@/components/landing/shader-hero";
import CtaPills from "./CtaPills";
import ResearchWorkspace from "./ResearchWorkspace";
import WaitlistContainerScroll from "./WaitlistContainerScroll";

// Ported from Riven WaitlistHero.jsx — standard (non-zamp) hero path only.
// Tweaks statically resolved to defaults: theme=dark, heroBg=shader,
// heroTilt=32, heroHoverTilt=0. The R3F ShaderHero is swapped for Civic's raw
// WebGL ShaderHero (already recoloured blue). The showcase inside
// WaitlistContainerScroll renders <ResearchWorkspace fill /> exactly like Riven.

// Stagger variant — cinematic entrance with blur + scale. We deliberately do
// NOT short-circuit on prefers-reduced-motion; the landing hero is a one-shot
// entrance the user asked to always play.
const stagger = (
  delay = 0,
  opts: { y?: number; scale?: number; blur?: number; duration?: number } = {},
) => {
  const { y = 40, scale = 0.97, blur = 10, duration = 1.2 } = opts;
  return {
    hidden: { opacity: 0, y, scale, filter: `blur(${blur}px)` },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { duration, delay, ease: [0.16, 1, 0.3, 1] as const },
    },
  };
};

export default function WaitlistHero() {
  const heroTilt = 32;
  const heroHoverTilt = 0;
  const s = (
    delay: number,
    opts?: { y?: number; scale?: number; blur?: number; duration?: number },
  ) => stagger(delay, opts);

  const [skipEntrance] = useState(
    () => typeof window !== "undefined" && window.scrollY > 100,
  );
  const initial = skipEntrance ? "visible" : "hidden";

  const [, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Scroll-immersion: differential parallax. Card lifts faster than the dissolve.
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const r = (range: number[]) =>
    reduceMotion ? range.map(() => range[0]) : range;
  const cardY = useTransform(scrollYProgress, [0, 1], r([0, -160]));
  const cardScale = useTransform(scrollYProgress, [0, 1], r([1, 0.94]));
  const cardOpacity = useTransform(
    scrollYProgress,
    [0, 0.5, 0.85],
    r([1, 0.85, 0]),
  );
  const dissolveY = useTransform(scrollYProgress, [0, 1], r([0, 40]));

  return (
    <section
      ref={sectionRef}
      id="top"
      style={{
        position: "relative",
        minHeight: "var(--wl-hero-min-h)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "var(--wl-hero-pt) 0 var(--wl-hero-pb) 0",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {/* Hero background — Civic blue WebGL shader (was Riven R3F ShaderHero) */}
      <ShaderHero />

      {/* Vertical fade at top for nav legibility */}
      <div
        aria-hidden="true"
        data-hero-fade="top"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(6,8,16,0.45) 0%, transparent 14%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Bottom dissolve — fades the shader into white so the seam isn't visible */}
      <motion.div
        aria-hidden="true"
        data-hero-fade="bottom"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55vh",
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.55) 55%, #ffffff 92%, #ffffff 100%)",
          pointerEvents: "none",
          zIndex: 1,
          y: dissolveY,
        }}
      />

      <div
        className="wl-lp-narrow"
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          width: "100%",
        }}
      >
        {/* Eyebrow brand mark — small, accent role */}
        <motion.div
          variants={s(0)}
          initial={initial}
          animate="visible"
          style={{
            margin: "0 auto 20px",
            maxWidth: "var(--wl-hero-content-max)",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "rgb(var(--wl-emerald-rgb))",
              boxShadow: "0 0 10px rgb(var(--wl-emerald-rgb) / 0.65)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--wl-font-mono)",
              fontSize: 11.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgb(var(--wl-ink-rgb) / 0.65)",
            }}
          >
            Live in Cumming, GA
          </span>
        </motion.div>

        {/* Dominant headline — outcome-led */}
        <motion.h1
          variants={s(0.1, { y: 56, scale: 0.96, blur: 12, duration: 1.4 })}
          initial={initial}
          animate="visible"
          className="wl-display"
          style={{
            fontSize: "clamp(34px, 5.2vw, 68px)",
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            fontWeight: 300,
            margin: "0 auto 16px",
            color: "rgb(var(--wl-ink-rgb))",
            maxWidth: "var(--wl-hero-content-max)",
          }}
        >
          See it. Snap it.{" "}
          <span
            className="wl-display-italic"
            style={{ color: "rgb(var(--wl-emerald-rgb))" }}
          >
            Your city
          </span>{" "}
          fixes it.
        </motion.h1>

        {/* Sub-benefit — 1 line */}
        <motion.p
          variants={s(0.22)}
          initial={initial}
          animate="visible"
          style={{
            fontFamily: "var(--wl-font-body)",
            fontSize: "clamp(14px, 1.15vw, 17px)",
            lineHeight: 1.5,
            fontWeight: 300,
            margin: "0 auto 24px",
            color: "rgb(var(--wl-ink-rgb) / 0.7)",
            maxWidth: 560,
          }}
        >
          One photo files the report. AI classifies it in 1.4 seconds, dedupes,
          and routes the work order &mdash; before anyone picks up a phone.
        </motion.p>

        {/* CTA row — pill button pair + small caption */}
        <motion.div
          variants={s(0.32)}
          initial={initial}
          animate="visible"
          style={{
            marginTop: "var(--wl-pitch-gap-headline)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--wl-pitch-gap-cta)",
          }}
        >
          <div
            id="join"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              maxWidth: 480,
            }}
          >
            <CtaPills />
          </div>
          <p
            style={{
              fontFamily: "var(--wl-font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 400,
              color: "rgba(232,237,245,0.42)",
              margin: 0,
            }}
          >
            Snap once · AI routes it · median report in 8 seconds
          </p>
        </motion.div>

        {/* Scroll-flatten product showcase — ResearchWorkspace inside the same tilted frame */}
        <motion.div
          style={{
            y: cardY,
            scale: cardScale,
            opacity: cardOpacity,
            willChange: "transform, opacity",
          }}
        >
          <motion.div
            variants={s(0.55, { y: 90, scale: 0.92, blur: 18, duration: 1.7 })}
            initial={initial}
            animate="visible"
            className="wl-hero-showcase-wrapper"
            style={{
              marginTop: "var(--wl-showcase-mt)",
              marginBottom: "var(--wl-showcase-mb)",
              width: "100%",
              maxWidth: "var(--wl-showcase-max-w)",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <WaitlistContainerScroll tilt={heroTilt} hoverTilt={heroHoverTilt}>
              <ResearchWorkspace fill />
            </WaitlistContainerScroll>
          </motion.div>
        </motion.div>
      </div>

      {/* Mobile fallback */}
      <style>{`
        @media (max-width: 900px) {
          .wl-hero-showcase-tilt { transform: rotateX(0deg) !important; }
        }
        @media (max-width: 768px) {
          .wl-hero-showcase-wrapper { margin-top: 24px !important; }
        }
      `}</style>
    </section>
  );
}

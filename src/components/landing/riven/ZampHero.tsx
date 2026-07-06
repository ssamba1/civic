"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MapPinStory from "./MapPinStory";
import { useMapPreset } from "./MapPresetContext";
import StaticHeroMap from "./StaticHeroMap";
import ZampMapBackdropLazy, { ZampMapFallback } from "./ZampMapBackdropLazy";

// Zamp hero — colossal per-letter "Civic" wordmark anchored bottom-left, with
// a black glass sign-up card on the right. The full-bleed ZampShader fills the
// hero behind the content. Per-letter rise stagger driven by framer-motion.

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block" }}
    >
      <path
        d="M3 8h10m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Glass-card inner stagger child — fades up with the card.
const glassChild = {
  collapsed: { opacity: 0, y: 14 },
  expanded: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function ZampHero({ pinStory = false }: { pinStory?: boolean }) {
  // tweaksVisible (?tweaks=1, dev only) swaps the static plate back for the
  // LIVE maplibre/deck.gl map — the studio used to retune presets and re-run
  // scripts/capture-hero-map.mjs. Public visitors never mount it, so the
  // ~1.85MB map chunk never enters the route.
  const { tweaksVisible } = useMapPreset();

  const [skipEntrance] = useState(
    () => typeof window !== "undefined" && window.scrollY > 100,
  );

  // Mobile: skip per-letter stagger (the 100vh rise reads as jank on narrow
  // viewports). Plain text renders instantly.
  //
  // showMap also gates the heavy live map: it starts false (so the server and
  // first client render are identical — gradient only, no hydration mismatch)
  // and is set true ONLY on non-mobile, after first paint. Phones therefore
  // never mount the lazy wrapper and never download maplibre-gl / deck.gl.
  const [isMobile, setIsMobile] = useState(false);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => {
      setIsMobile(mq.matches);
      setShowMap(!mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Scroll-immersion: wordmark drifts up slower (background plane); glass card
  // lifts faster + fades earlier (foreground plane).
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const r = (range: number[]) =>
    reduceMotion ? range.map(() => range[0]) : range;
  const wordmarkY = useTransform(scrollYProgress, [0, 1], r([0, -80]));
  const wordmarkScale = useTransform(scrollYProgress, [0, 1], r([1, 1.08]));
  const wordmarkOpacity = useTransform(
    scrollYProgress,
    [0, 0.55, 0.85],
    r([1, 0.7, 0]),
  );
  const cardY = useTransform(scrollYProgress, [0, 1], r([0, -160]));
  const cardScale = useTransform(scrollYProgress, [0, 1], r([1, 0.94]));
  const cardOpacity = useTransform(
    scrollYProgress,
    [0, 0.5, 0.85],
    r([1, 0.85, 0]),
  );

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
      {/* Full-bleed backdrop behind the hero content. The gradient paints
          immediately (and is the FINAL backdrop on mobile); on desktop a static
          captured plate of the Cumming map layers over it (one JPEG fetch, no
          map JS) with cursor parallax. ?tweaks=1 swaps in the live map. */}
      <ZampMapFallback />
      {showMap && (tweaksVisible ? <ZampMapBackdropLazy /> : <StaticHeroMap />)}
      {/* Animated report pins + glass moment-cards, glued to the static plate
          (they ride the exact same lean transform — see MapPinStory). Skipped
          over the live tweaks map, whose deck.gl layers already render a
          geo-anchored pin field, and on mobile, where there is no plate. */}
      {pinStory && showMap && !tweaksVisible && <MapPinStory />}

      <div
        className="wl-lp-narrow"
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          width: "100%",
        }}
      >
        {/* Colossal per-letter "Civic" wordmark — the hero IS the wordmark. */}
        <motion.h1
          className="wl-zamp-wordmark"
          aria-label="Civic"
          style={{
            paddingTop: "0.08em",
            y: wordmarkY,
            scale: wordmarkScale,
            opacity: wordmarkOpacity,
            willChange: "transform, opacity",
          }}
          initial={isMobile ? false : "hidden"}
          animate="visible"
          variants={
            isMobile
              ? undefined
              : {
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
                  },
                }
          }
        >
          {isMobile
            ? "Civic"
            : Array.from("Civic").map((ch, i) => (
                <motion.span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static 5-letter wordmark, index is stable
                  key={i}
                  className="wl-zamp-letter"
                  aria-hidden="true"
                  variants={{
                    hidden: { y: "100vh", opacity: 0 },
                    visible: {
                      y: "0%",
                      opacity: 1,
                      transition: {
                        duration: 1.6,
                        ease: [0.16, 1, 0.3, 1] as const,
                      },
                    },
                  }}
                >
                  {ch}
                </motion.span>
              ))}
        </motion.h1>

        <aside className="wl-zamp-hero-aside">
          <motion.div
            style={{
              y: cardY,
              scale: cardScale,
              opacity: cardOpacity,
              willChange: "transform, opacity",
            }}
          >
            <motion.div
              className="wl-zamp-glass-card"
              initial={skipEntrance ? false : "collapsed"}
              animate="expanded"
              variants={{
                collapsed: { opacity: 0, y: 28 },
                expanded: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.9,
                    delay: 0.35,
                    ease: [0.22, 1, 0.36, 1] as const,
                  },
                },
              }}
            >
              <motion.p variants={glassChild} className="wl-zamp-tagline">
                An AI-native 311{" "}
                <em>grounded in photos your residents actually send.</em>
              </motion.p>
              <motion.ul variants={glassChild} className="wl-zamp-feature-list">
                <li>
                  <span>
                    <strong>Built-in triage AI</strong> — classifies, dedupes,
                    and routes every photo in 1.4 seconds.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Open311 native</strong> — SeeClickFix, Tyler, and
                    Granicus ingest reports with zero rework.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Public by default</strong> — every report and
                    resolution time on a live dashboard.
                  </span>
                </li>
              </motion.ul>
              <motion.div
                variants={glassChild}
                id="join"
                className="wl-zamp-hero-form"
              >
                <Link
                  href="/onboard"
                  className="wl-zamp-hero-cta wl-zamp-hero-cta--primary"
                >
                  Set up your city <ArrowRightIcon />
                </Link>
                <Link
                  href="/city/cumming"
                  className="wl-zamp-hero-cta wl-zamp-hero-cta--ghost"
                >
                  See the live dashboard
                </Link>
                <p>Live in minutes · no code required</p>
              </motion.div>
            </motion.div>
          </motion.div>
        </aside>
      </div>
    </section>
  );
}

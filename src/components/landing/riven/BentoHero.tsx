"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// Bento "Playroom" hero, asymmetric tile grid with a pre-rendered clay
// neighborhood as the centerpiece. The scene plays the product promise once:
// pin drops on the pothole (report filed), then the scene crossfades from
// broken to fixed (crew resolved it). Assets: scripts/gen-clay.mjs →
// public/landing-clay/. Mounted behind ?hero=bento (see index.tsx).

const EASE = [0.22, 1, 0.36, 1] as const;

// One-shot story timeline (seconds).
const T_PIN_DROP = 0.9; // pin lands on the pothole
const T_HEAL = 2.1; // broken → fixed crossfade begins

const tile = {
  hidden: { opacity: 0, y: 26 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

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

const PROOF_TILES = [
  {
    icon: "/landing-clay/icon-triage.webp",
    alt: "Clay smartphone with an AI spark",
    stat: "1.4s",
    label: "AI triage per photo",
  },
  {
    icon: "/landing-clay/icon-open311.webp",
    alt: "Clay sync arrows between two boxes",
    stat: "Open311",
    label: "native, zero rework",
  },
  {
    icon: "/landing-clay/icon-dashboard.webp",
    alt: "Clay bar chart trending upward",
    stat: "Public",
    label: "every report live",
  },
];

export default function BentoHero() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="wl-bento-hero">
      <motion.div
        className="wl-bento-grid"
        initial={reduceMotion ? false : "hidden"}
        animate="shown"
        variants={{
          hidden: {},
          shown: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
        }}
      >
        {/* Copy tile, headline, subtext, CTAs. */}
        <motion.div className="wl-bento-tile wl-bento-copy" variants={tile}>
          <h1 className="wl-bento-headline">The 311 that runs on photos</h1>
          <p className="wl-bento-sub">
            Residents snap the problem. AI routes it to the right crew in
            seconds. Everyone sees it fixed.
          </p>
          <div className="wl-bento-ctas" id="join">
            <Link
              href="/onboard"
              className="wl-zamp-hero-cta wl-zamp-hero-cta--primary"
            >
              Set up your city <ArrowRightIcon />
            </Link>
            <Link
              href="/city/cumming"
              className="wl-zamp-hero-cta wl-zamp-hero-cta--ghost wl-bento-cta-ghost"
            >
              See the live dashboard
            </Link>
          </div>
        </motion.div>

        {/* Scene tile, the clay neighborhood heals itself once. */}
        <motion.div className="wl-bento-tile wl-bento-scene" variants={tile}>
          <div className="wl-bento-scene-stage">
            <Image
              src="/landing-clay/neighborhood-broken.webp"
              alt="Clay model of a neighborhood street with a pothole and a leaning streetlight"
              width={960}
              height={720}
              priority
              className="wl-bento-scene-img"
            />
            {/* Fixed state fades in over the broken one. Reduced motion: shown
                immediately, so the resolved street is the static image. */}
            <motion.div
              className="wl-bento-scene-img wl-bento-scene-fixed"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delay: T_HEAL, duration: 1.3, ease: "easeInOut" }
              }
            >
              <Image
                src="/landing-clay/neighborhood-fixed.webp"
                alt="The same clay neighborhood with a smooth repaired road and a glowing streetlight"
                width={960}
                height={720}
                className="wl-bento-scene-img"
              />
            </motion.div>
            {/* Report pin drops onto the pothole. */}
            <motion.div
              className="wl-bento-pin"
              initial={
                reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -110 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      delay: T_PIN_DROP,
                      type: "spring",
                      stiffness: 320,
                      damping: 17,
                      opacity: { delay: T_PIN_DROP, duration: 0.15 },
                    }
              }
            >
              <Image
                src="/landing-clay/pin-alpha.webp"
                alt=""
                aria-hidden="true"
                width={72}
                height={90}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Proof tiles, the pipeline in three clay icons. */}
        {PROOF_TILES.map((p) => (
          <motion.div
            key={p.stat}
            className="wl-bento-tile wl-bento-proof"
            variants={tile}
          >
            <Image
              src={p.icon}
              alt={p.alt}
              width={64}
              height={64}
              className="wl-bento-proof-icon"
            />
            <p className="wl-bento-proof-text">
              <strong>{p.stat}</strong> {p.label}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

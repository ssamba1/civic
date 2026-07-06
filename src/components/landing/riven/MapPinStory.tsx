"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, MapPin } from "lucide-react";

// Animated report-pin narrative over the hero map plate: each pin drops onto a
// street (report filed), pulses once (AI classifying), then flips green with a
// check (crew fixed it). One-shot storytelling of Snap -> Route -> Fix on the
// real Cumming basemap. Reduced motion: pins render settled (green) instantly.

type Pin = {
  left: string; // % over the map plate
  top: string;
  label: string;
  delay: number; // s, story start offset
  tone: keyof typeof PIN_TONES; // open-state color; fixed state is always green
};

const PINS: Pin[] = [
  { left: "16%", top: "34%", label: "Pothole", delay: 0.6, tone: "amber" },
  { left: "38%", top: "62%", label: "Streetlight", delay: 1.5, tone: "violet" },
  { left: "62%", top: "28%", label: "Water leak", delay: 2.4, tone: "sky" },
  { left: "50%", top: "18%", label: "Debris", delay: 3.3, tone: "rose" },
];

// Per-pin story beats, relative to its delay.
const T_RING = 0.45; // classify pulse starts once the pin lands
const T_FIX = 1.6; // flips to fixed

// Ambient report field — replaces the status dots that used to be baked into
// the hero-map.jpg plate (capture now runs with ?mapMarkers=0). Same teardrop
// silhouette as the story pins, miniaturized, category-toned: amber (roads),
// violet (lighting), sky (water), rose (safety), teal (drainage), lime
// (parks), plus orange/red severity flares — the field reads as a live,
// many-department report map rather than single-issue clutter.
// Positions are hand-seeded to echo the old deck.gl hotspot clusters and to
// stay clear of the wordmark, glass card, and moment-cards.
const PIN_TONES = {
  amber: { fill: "#f59e0b", glow: "rgba(217, 119, 6, 0.45)" },
  orange: { fill: "#f97316", glow: "rgba(234, 88, 12, 0.45)" },
  red: { fill: "#dc2626", glow: "rgba(185, 28, 28, 0.5)" },
  violet: { fill: "#8b5cf6", glow: "rgba(124, 58, 237, 0.45)" },
  sky: { fill: "#0ea5e9", glow: "rgba(2, 132, 199, 0.45)" },
  rose: { fill: "#f43f5e", glow: "rgba(225, 29, 72, 0.45)" },
  teal: { fill: "#14b8a6", glow: "rgba(13, 148, 136, 0.45)" },
  lime: { fill: "#84cc16", glow: "rgba(101, 163, 13, 0.45)" },
} as const;

type Report = {
  left: string;
  top: string;
  tone: keyof typeof PIN_TONES;
  size: number; // px, teardrop square
};

const REPORTS: Report[] = [
  // main cluster — center of town
  { left: "46%", top: "31%", tone: "amber", size: 14 },
  { left: "51%", top: "35%", tone: "sky", size: 16 },
  { left: "55%", top: "30%", tone: "violet", size: 13 },
  { left: "48%", top: "39%", tone: "red", size: 18 },
  { left: "57%", top: "37%", tone: "teal", size: 15 },
  { left: "53%", top: "42%", tone: "orange", size: 14 },
  { left: "44%", top: "44%", tone: "lime", size: 13 },
  { left: "59%", top: "44%", tone: "rose", size: 15 },
  // lower cluster — south of the highway
  { left: "40%", top: "52%", tone: "violet", size: 16 },
  { left: "46%", top: "56%", tone: "amber", size: 14 },
  { left: "52%", top: "53%", tone: "red", size: 17 },
  { left: "43%", top: "61%", tone: "sky", size: 13 },
  { left: "50%", top: "62%", tone: "orange", size: 14 },
  { left: "56%", top: "58%", tone: "teal", size: 15 },
  // fringe — sparse singles filling the frame
  { left: "30%", top: "42%", tone: "lime", size: 13 },
  { left: "34%", top: "27%", tone: "violet", size: 14 },
  { left: "66%", top: "50%", tone: "sky", size: 13 },
  { left: "26%", top: "57%", tone: "red", size: 15 },
  { left: "68%", top: "35%", tone: "amber", size: 13 },
  { left: "36%", top: "68%", tone: "teal", size: 14 },
  { left: "60%", top: "66%", tone: "orange", size: 13 },
  { left: "22%", top: "36%", tone: "rose", size: 13 },
];

function FieldPin({
  r,
  index,
  reduce,
}: {
  r: Report;
  index: number;
  reduce: boolean;
}) {
  const tone = PIN_TONES[r.tone];
  return (
    <motion.span
      initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              delay: 0.2 + index * 0.055,
              type: "spring",
              stiffness: 340,
              damping: 19,
            }
      }
      style={{
        position: "absolute",
        left: r.left,
        top: r.top,
        width: r.size,
        height: r.size,
        // anchor the teardrop TIP to the map coordinate, grow from it
        marginLeft: -r.size / 2,
        marginTop: -r.size,
        transformOrigin: "50% 100%",
        willChange: "transform, opacity",
      }}
    >
      <span
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: "50% 50% 50% 4px",
          transform: "rotate(-45deg)",
          background: tone.fill,
          border: "1.5px solid rgba(255,255,255,0.9)",
          boxShadow: `0 4px 10px ${tone.glow}`,
        }}
      />
    </motion.span>
  );
}

// Floating glass moment-cards — each narrates a pipeline stage as the pins
// play out. Copy mirrors the landing's real claims (1.4s triage, Open311
// routing, public before/after) — nothing invented.
type Moment = {
  left: string;
  top: string;
  title: string;
  body: string;
  delay: number;
};

const MOMENTS: Moment[] = [
  {
    left: "22%",
    top: "16%",
    title: "AI triage",
    body: "Pothole · classified in 1.4s",
    delay: 1.4,
  },
  {
    left: "44%",
    top: "44%",
    title: "Routed",
    body: "Public Works · via Open311",
    delay: 2.6,
  },
  {
    left: "6%",
    top: "50%",
    title: "Resident notified",
    body: "Before / after photo sent",
    delay: 3.8,
  },
];

function GlassMoment({ m, reduce }: { m: Moment; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: m.delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }
      }
      style={{
        position: "absolute",
        left: m.left,
        top: m.top,
        maxWidth: 210,
        padding: "10px 14px",
        borderRadius: 14,
        background: "rgba(10, 12, 16, 0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.12), 0 14px 40px -12px rgba(0,0,0,0.5)",
        willChange: "transform, opacity",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {m.title}
      </span>
      <span
        style={{
          display: "block",
          marginTop: 3,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          color: "rgba(255,255,255,0.94)",
        }}
      >
        {m.body}
      </span>
    </motion.div>
  );
}

function StoryPin({ pin, reduce }: { pin: Pin; reduce: boolean }) {
  const tone = PIN_TONES[pin.tone];
  return (
    <div
      style={{
        position: "absolute",
        left: pin.left,
        top: pin.top,
        transform: "translate(-50%, -100%)",
      }}
    >
      {/* classify pulse ring */}
      {!reduce && (
        <motion.span
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.55, 0], scale: [0.4, 2.1, 2.6] }}
          transition={{
            delay: pin.delay + T_RING,
            duration: 1.1,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: -7,
            width: 30,
            height: 30,
            marginLeft: -15,
            borderRadius: "50%",
            border: `2px solid ${tone.fill}`,
            willChange: "transform, opacity",
          }}
        />
      )}

      {/* the pin itself: category-toned (open) with the green fixed state
          fading in over it */}
      <motion.div
        initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: -70 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                delay: pin.delay,
                type: "spring",
                stiffness: 380,
                damping: 20,
                opacity: { delay: pin.delay, duration: 0.12 },
              }
        }
        style={{ position: "relative", willChange: "transform, opacity" }}
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: "50% 50% 50% 4px",
            transform: "rotate(-45deg)",
            background: tone.fill,
            boxShadow: `0 6px 16px ${tone.glow}`,
            border: "2px solid rgba(255,255,255,0.9)",
          }}
        >
          <MapPin
            size={16}
            strokeWidth={2.5}
            color="#fff"
            style={{ transform: "rotate(45deg)" }}
          />
        </span>
        {/* fixed state overlays the open pin */}
        <motion.span
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={
            reduce
              ? { duration: 0 }
              : { delay: pin.delay + T_FIX, duration: 0.35 }
          }
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: "50% 50% 50% 4px",
            transform: "rotate(-45deg)",
            background: "#16a34a",
            boxShadow: "0 6px 16px rgba(21, 128, 61, 0.45)",
            border: "2px solid rgba(255,255,255,0.9)",
          }}
        >
          <Check
            size={16}
            strokeWidth={3}
            color="#fff"
            style={{ transform: "rotate(45deg)" }}
          />
        </motion.span>
      </motion.div>

      {/* label chip appears with the fix */}
      <motion.span
        initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : { delay: pin.delay + T_FIX + 0.15, duration: 0.4 }
        }
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(100% + 6px)",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          padding: "3px 9px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.01em",
          color: "#14532d",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(21, 128, 61, 0.25)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
          willChange: "transform, opacity",
        }}
      >
        {pin.label} · Fixed
      </motion.span>
    </div>
  );
}

export default function MapPinStory() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5, // over the map plate, under the wordmark/card (z 10)
        pointerEvents: "none",
        // Ride the map's cursor-lean camera (vars published per-frame by
        // StaticHeroMap onto the hero section) at factor 1.0 — the exact
        // matrix the plate applies. Pin positions were tuned against the
        // plate at rest (which includes its 1.16 scale), so translate+rotate
        // alone keeps every pin glued to its street: overlay point p = S·q,
        // and T·R·p = T·R·S·q, the plate's own mapping of street point q.
        // (The old 0.9 factor made pins drift off their streets as the map
        // leaned.)
        transform:
          "perspective(1200px) translate3d(calc(var(--wl-lean-x, 0) * 1%), calc(var(--wl-lean-y, 0) * 1%), 0) rotateX(calc(var(--wl-lean-rx, 0) * 1deg)) rotateY(calc(var(--wl-lean-ry, 0) * 1deg))",
        willChange: "transform",
      }}
    >
      {REPORTS.map((r, i) => (
        <FieldPin key={`${r.left}-${r.top}`} r={r} index={i} reduce={reduce} />
      ))}
      {PINS.map((p) => (
        <StoryPin key={p.label} pin={p} reduce={reduce} />
      ))}
      {MOMENTS.map((m) => (
        <GlassMoment key={m.title} m={m} reduce={reduce} />
      ))}
    </div>
  );
}

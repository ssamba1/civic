"use client";

// Zamp sections 1-5, ported VERBATIM from Riven's variations/v2/zamp/Section*.jsx.
// Only two changes vs. source: green→blue accent (in zamp.css) and Riven→Civic
// copy (here). Layout, sizes, and animation choreography are unchanged.
//
// Two mechanical substitutions forced by the Civic dependency set:
//   · S2 anime.js breathing loop → GSAP yoyo tween (animejs is not a Civic dep;
//     gsap + @gsap/react are). Same visual: a slow scale pulse composed on top
//     of the GSAP sway via a separate quickTo-free tween target.
//   · S3 supabase signup-count RPC → qualitative "cohort open" copy (no fabricated
//     slots-claimed count), plus an inline TiltCard built on Civic's useMouseTilt hook.

import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CountUp, Reveal, StaggerGroup, StaggerItem } from "./anim";
import useMouseTilt from "./useMouseTilt";

gsap.registerPlugin(useGSAP);

/* ════════════════════════════════════════════════════════════════
   SECTION 1, Why Civic
   ════════════════════════════════════════════════════════════════ */

export function ZampSection1() {
  return (
    <section
      className="wl-zamp-section wl-zamp-s1"
      id="problem"
      aria-labelledby="zamp-s1-eyebrow"
    >
      <span id="zamp-s1-eyebrow" className="wl-zamp-eyebrow">
        01 &middot; Why Civic
      </span>

      <Reveal as="div" className="wl-zamp-s1-stanza" y={28} duration={0.8}>
        <p className="wl-zamp-s1-pullquote">
          <em>Reported</em>, or it didn&rsquo;t happen.
        </p>
        <p className="wl-zamp-s1-subquote">
          A 311 that refuses to lose your report.
        </p>
      </Reveal>

      <div className="wl-zamp-s1-rule" aria-hidden="true" />

      <div className="wl-zamp-s1-grid">
        <Reveal
          as="div"
          className="wl-zamp-s1-col wl-zamp-s1-col--left"
          y={32}
          duration={0.95}
        >
          <div className="wl-zamp-s1-numeral wl-zamp-s1-numeral--mega">
            <CountUp to={0} duration={1.6} />
          </div>
          <p className="wl-zamp-s1-caption">
            forms, dropdowns, phone trees &middot; ever
          </p>
        </Reveal>

        <StaggerGroup
          className="wl-zamp-s1-col wl-zamp-s1-col--right"
          delayChildren={0.1}
          stagger={0.08}
        >
          <StaggerItem as="p" className="wl-zamp-s1-manifesto">
            Reporting a pothole today means a 47-dropdown form or a hold queue
            &mdash; the work stops being reporting and starts being patience.
          </StaggerItem>
          <StaggerItem
            as="p"
            className="wl-zamp-s1-manifesto wl-zamp-s1-manifesto--lead"
          >
            Civic is one camera button that remembers where, when, and what
            &mdash; and routes it itself.
          </StaggerItem>

          <StaggerItem as="div" className="wl-zamp-s1-numeral-row">
            <div className="wl-zamp-s1-numeral wl-zamp-s1-numeral--mid">
              <CountUp
                to={8}
                duration={2.4}
                delay={0}
                amount={0.2}
                ease={[0.16, 1, 0.3, 1]}
              />
              <span className="wl-zamp-s1-numeral-unit">s</span>
            </div>
            <p className="wl-zamp-s1-caption wl-zamp-s1-caption--right">
              median time to file a report &middot; Cumming, GA
            </p>
          </StaggerItem>
        </StaggerGroup>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION 2 (How it works) 3D constellation scene
   ════════════════════════════════════════════════════════════════ */

const SLOT_POSE: Record<
  string,
  {
    rotY: number;
    rotX: number;
    z: number;
    peakY: number;
    peakZ: number;
    floatDur: number;
    baseScale: number;
  }
> = {
  snap: {
    rotY: 12,
    rotX: -2,
    z: -80,
    peakY: -14,
    peakZ: 12,
    floatDur: 4.5,
    baseScale: 1.18,
  },
  classify: {
    rotY: -14,
    rotX: -2,
    z: 100,
    peakY: -10,
    peakZ: 12,
    floatDur: 6.5,
    baseScale: 1,
  },
  route: {
    rotY: -10,
    rotX: 3,
    z: -100,
    peakY: -16,
    peakZ: 12,
    floatDur: 4.0,
    baseScale: 1.18,
  },
  track: {
    rotY: 11,
    rotX: 2,
    z: 200,
    peakY: -12,
    peakZ: 14,
    floatDur: 7.0,
    baseScale: 1,
  },
};

const SCENE_PERSPECTIVE = 1200;
const HOVER_LIFT_Z = 230;
const EDITOR_HOVER_LIFT_Z = 500;

const EDITOR_POSE = { rotY: -8, rotX: 6, peakY: -12, peakZ: 18, floatDur: 5.5 };

const MOTION: Record<
  string,
  {
    rot: number;
    enterDelay: number;
    swayDur: number;
    swayKf: { x: number; y: number }[];
    breatheTo: number;
    breatheDur: number;
    breatheDelay: number;
  }
> = {
  snap: {
    rot: -3,
    enterDelay: 0.05,
    swayDur: 7,
    swayKf: [
      { x: 10, y: -14 },
      { x: 14, y: -6 },
      { x: -8, y: -10 },
    ],
    breatheTo: 1.042,
    breatheDur: 4200,
    breatheDelay: 200,
  },
  classify: {
    rot: 2.5,
    enterDelay: 0.18,
    swayDur: 9,
    swayKf: [
      { x: 12, y: -16 },
      { x: 16, y: 2 },
      { x: -10, y: -12 },
    ],
    breatheTo: 1.036,
    breatheDur: 5400,
    breatheDelay: 500,
  },
  route: {
    rot: 2,
    enterDelay: 0.31,
    swayDur: 6,
    swayKf: [
      { x: -8, y: -8 },
      { x: 2, y: -12 },
      { x: 9, y: -6 },
    ],
    breatheTo: 1.038,
    breatheDur: 3900,
    breatheDelay: 900,
  },
  track: {
    rot: -2.5,
    enterDelay: 0.44,
    swayDur: 10,
    swayKf: [
      { x: -14, y: -10 },
      { x: -18, y: -18 },
      { x: 12, y: -8 },
      { x: 18, y: -14 },
    ],
    breatheTo: 1.048,
    breatheDur: 6400,
    breatheDelay: 1300,
  },
};

function CardHeader({
  eyebrow,
  label,
  body,
}: {
  eyebrow: string;
  label: string;
  body: string;
}) {
  return (
    <div className="wl-zamp-orbit-card-meta">
      <span className="wl-zamp-orbit-card-eyebrow">{eyebrow}</span>
      <span className="wl-zamp-orbit-card-label">{label}</span>
      <span className="wl-zamp-orbit-card-body">{body}</span>
    </div>
  );
}

/* 01 SNAP. Live map showing resident reports pinned across Cumming. */
function SnapMock() {
  return (
    <ScreenshotMock
      src="/landing-shots/shot-map.webp"
      alt="Civic map. Resident reports pinned across Cumming with dispatch panel"
      objectPos="center top"
    />
  );
}

function ScreenshotMock({
  src,
  alt,
  objectPos = "left top",
}: {
  src: string;
  alt: string;
  objectPos?: string;
}) {
  return (
    <div
      className="wl-zamp-mock wl-zamp-mock--shot"
      role="img"
      aria-label={alt}
      style={{
        backgroundImage: `url('${src}')`,
        backgroundPosition: objectPos,
      }}
    />
  );
}

const ClassifyMock = () => (
  <ScreenshotMock
    src="/landing-shots/shot-reports.webp"
    alt="Civic reports panel, AI reasoning, severity classification, and SLA scoring"
    objectPos="left top"
  />
);
const RouteMock = () => (
  <ScreenshotMock
    src="/landing-shots/shot-routing.webp"
    alt="Civic workload distribution and default routing matrix by issue category"
    objectPos="left top"
  />
);
const TrackMock = () => (
  <ScreenshotMock
    src="/landing-shots/shot-analytics.webp"
    alt="Civic city analytics, 831 fixed, reports over time, severity breakdown"
    objectPos="center top"
  />
);

type OrbitCardData = {
  key: string;
  pos: string;
  eyebrow: string;
  label: string;
  body: string;
  longBody: string;
  Mock: () => ReactNode;
};

const ORBIT_CARDS: OrbitCardData[] = [
  {
    key: "snap",
    pos: "tl",
    eyebrow: "01 · Snap",
    label: "One photo from the resident PWA",
    body: "A resident snaps the problem, location, time, and metadata attach automatically.",
    longBody:
      "A resident opens the Civic PWA, no app store, no account, points the camera at broken infrastructure, and taps once. Location, timestamp, and device metadata attach automatically. Faces, plates, and door numbers are blurred on-device before the photo ever leaves the phone. No category dropdowns, no phone tree, no form designed in 2003.",
    Mock: SnapMock,
  },
  {
    key: "classify",
    pos: "tr",
    eyebrow: "02 · Classify",
    label: "Vision AI grades severity and dedupes neighbors",
    body: "Gemini 2.5 grades severity and dedupes against nearby reports in 1.4 seconds.",
    longBody:
      "Gemini 2.5 Flash vision identifies the issue type, grades severity, and names the responsible department in about 1.4 seconds at roughly $0.0001 per photo. It dedupes the report against existing nearby reports so a crew never gets the same pothole five times. A human reviewer in the city dashboard can override any classification, and overrides refine future runs.",
    Mock: ClassifyMock,
  },
  {
    key: "route",
    pos: "bl",
    eyebrow: "03 · Route",
    label: "A costed work order lands with the right crew",
    body: "A priced Open311 work order is generated and dispatched to the right department.",
    longBody:
      "Civic drafts an Open311 GeoReport v2 work order with an estimated repair cost, the crew type, and the materials list already filled in, then dispatches it to the right crew with the photo and exact location attached. Existing SeeClickFix, Tyler, Granicus, or in-house backends ingest it natively, zero rework, no rip-and-replace. The crew loads the right materials before they leave the yard because they can see the problem and its price.",
    Mock: RouteMock,
  },
  {
    key: "track",
    pos: "br",
    eyebrow: "04 · Track",
    label: "Public dashboard clocks resolution time",
    body: "Every report and its resolution time is public on a live accountability dashboard.",
    longBody:
      "Every report is public on the city dashboard with a timestamp and status. No account required to watch it. The resident gets a push when the work order is dispatched and a before/after photo when the crew marks it complete. Cities that miss their stated SLA rise to the top of the accountability page, so a 'lost' report cannot stay lost.",
    Mock: TrackMock,
  },
];

const FALLBACK_MOTION = MOTION.snap;

function OrbitCard({
  card,
  expanded,
  onToggle,
}: {
  card: OrbitCardData;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const { Mock } = card;
  const profile = MOTION[card.key] || FALLBACK_MOTION;
  const ref = useRef<HTMLDivElement>(null);
  const swayRef = useRef<gsap.core.Timeline | null>(null);
  const breatheRef = useRef<gsap.core.Tween | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      gsap.set(el, { opacity: 0, y: 24, rotation: profile.rot });
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "expo.out",
        delay: profile.enterDelay,
      });

      // Reduced-motion gate intentionally removed. Idle motion is forced on
      // per product decision (motion is core to the S2 hero scene).

      const segments = profile.swayKf.length + 1;
      const segDur = profile.swayDur / segments;
      const tl = gsap.timeline({
        repeat: -1,
        delay: profile.enterDelay + 0.95,
        defaults: { ease: "sine.inOut", duration: segDur },
      });
      for (const p of profile.swayKf) {
        tl.to(el, { x: p.x, y: p.y });
      }
      tl.to(el, { x: 0, y: 0 });
      swayRef.current = tl;

      // Breathing loop, GSAP yoyo tween on `scale` (replaces the Riven
      // anime.js loop; animejs is not a Civic dep). Scale composes with the
      // sway timeline's x/y via the shared transform matrix.
      breatheRef.current = gsap.to(el, {
        scale: profile.breatheTo,
        duration: profile.breatheDur / 2000,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        delay: profile.breatheDelay / 1000,
      });
    },
    { scope: ref },
  );

  useEffect(() => {
    if (expanded) {
      swayRef.current?.pause();
      breatheRef.current?.pause();
    } else {
      swayRef.current?.play();
      breatheRef.current?.play();
    }
  }, [expanded]);

  const handleEnter = useCallback(() => {
    if (expanded) return;
    swayRef.current?.pause();
    gsap.to(ref.current, {
      x: 0,
      y: -10,
      rotation: 0,
      duration: 0.5,
      ease: "expo.out",
      overwrite: "auto",
    });
  }, [expanded]);

  const handleLeave = useCallback(() => {
    if (expanded) return;
    gsap.to(ref.current, {
      y: 0,
      rotation: profile.rot,
      duration: 0.5,
      ease: "expo.out",
      overwrite: "auto",
      onComplete: () => swayRef.current?.play(),
    });
  }, [expanded, profile.rot]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: ported verbatim from Riven. Keyboard handler + tabIndex below make this div fully operable; a real <button> can't host the 3D-transformed card subtree without breaking the scene
    <div
      ref={ref}
      className={`wl-zamp-orbit-card wl-zamp-orbit-card--${card.pos}`}
      role="button"
      tabIndex={0}
      aria-pressed={expanded}
      aria-label={`${card.label}, click to ${expanded ? "collapse" : "expand"}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(card.key);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(card.key);
        }
      }}
    >
      <div className="wl-zamp-orbit-card-shot" aria-hidden="true">
        <Mock />
      </div>
      <CardHeader eyebrow={card.eyebrow} label={card.label} body={card.body} />
    </div>
  );
}

function ExpandedCardModal({
  card,
  onClose,
}: {
  card: (OrbitCardData & { Mock: () => ReactNode }) | null;
  onClose: () => void;
}) {
  if (!card) return null;
  const { Mock } = card;
  return createPortal(
    <div
      className="wl-zamp-expand-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={card.label}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ported verbatim from Riven. OnClick only stops propagation so a click inside the card doesn't bubble to the overlay's dismiss; the overlay (Escape) + close button own real keyboard dismissal */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same. This handler is a propagation guard, not an interactive control */}
      <div
        className="riven-root wl-design-zamp wl-zamp-expand-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="wl-zamp-expand-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="wl-zamp-expand-shot">
          <Mock />
        </div>
        <div className="wl-zamp-expand-meta">
          <span className="wl-zamp-orbit-card-eyebrow">{card.eyebrow}</span>
          <span className="wl-zamp-orbit-card-label">{card.label}</span>
          <span className="wl-zamp-orbit-card-body">
            {card.longBody || card.body}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EditorMock() {
  return (
    <div
      className="wl-zamp-mock wl-zamp-mock--shot"
      role="img"
      aria-label="Civic teams console, 11 municipal divisions, workload and queue depth"
      style={{
        backgroundImage: "url('/landing-shots/shot-teams.webp')",
        backgroundPosition: "center top",
      }}
    />
  );
}

const EDITOR_CARD: OrbitCardData = {
  key: "editor",
  pos: "center",
  eyebrow: "00 · Console",
  label: "The city console",
  body: "Report queue, work orders, AI routing, and the public dashboard, one console.",
  longBody:
    "Civic is one console for the whole 311 loop: an incoming report queue on the left, the active work order in the center, the AI routing + dedupe panel on the right, and the public accountability dashboard one tab over. Staff can override any classification, reassign crews, and watch resolution times in real time. Every report exports as Open311 GeoReport v2, so the systems the city already runs ingest it natively.",
  Mock: EditorMock,
};

function EditorCenterpiece({ onExpand }: { onExpand: () => void }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const outer = outerRef.current;
      const lift = liftRef.current;
      const pose = poseRef.current;
      const glow = glowRef.current;
      if (!outer || !lift || !pose) return;

      const mobile = window.matchMedia("(max-width: 900px)").matches;
      if (mobile) return;

      gsap.set(outer, { xPercent: -50, yPercent: -50 });
      gsap.set(lift, { z: 0, scale: 1 });
      gsap.set(pose, {
        rotateY: EDITOR_POSE.rotY,
        rotateX: EDITOR_POSE.rotX,
        y: 0,
        z: 0,
      });
      if (glow) gsap.set(glow, { z: -120, scale: 1 });
      const shadow = shadowRef.current;
      if (shadow)
        gsap.set(shadow, { rotateX: 82, z: -60, scale: 1, opacity: 1 });

      // Reduced-motion gate intentionally removed. Idle motion is forced on
      // per product decision (motion is core to the S2 hero scene).

      floatRef.current = gsap.timeline({
        repeat: -1,
        yoyo: true,
        defaults: { ease: "sine.inOut", duration: EDITOR_POSE.floatDur },
      });
      floatRef.current.to(
        pose,
        { y: EDITOR_POSE.peakY, z: EDITOR_POSE.peakZ },
        0,
      );
      if (shadow) {
        floatRef.current.to(shadow, { scale: 1.12, opacity: 0.7 }, 0);
      }
    },
    { scope: outerRef },
  );

  const handleEnter = useCallback(() => {
    floatRef.current?.pause();
    if (outerRef.current) outerRef.current.style.zIndex = "999";
    const counterScale =
      (SCENE_PERSPECTIVE - EDITOR_HOVER_LIFT_Z) / SCENE_PERSPECTIVE;
    gsap.to(liftRef.current, {
      z: EDITOR_HOVER_LIFT_Z,
      scale: counterScale,
      duration: 0.7,
      ease: "expo.out",
      overwrite: "auto",
    });
    gsap.to(poseRef.current, {
      y: 0,
      z: 0,
      duration: 0.7,
      ease: "expo.out",
      overwrite: "auto",
    });
    if (shadowRef.current) {
      gsap.to(shadowRef.current, {
        scale: 1.35,
        opacity: 0.5,
        z: -60,
        duration: 0.7,
        ease: "expo.out",
        overwrite: "auto",
      });
    }
  }, []);

  const handleLeave = useCallback(() => {
    if (outerRef.current) outerRef.current.style.zIndex = "";
    gsap.to(liftRef.current, {
      z: 0,
      scale: 1,
      duration: 0.7,
      ease: "expo.out",
      overwrite: "auto",
    });
    gsap.to(poseRef.current, {
      y: 0,
      z: 0,
      duration: 0.45,
      ease: "expo.out",
      overwrite: "auto",
      onComplete: () => floatRef.current?.play(0),
    });
    if (shadowRef.current) {
      gsap.to(shadowRef.current, {
        scale: 1,
        opacity: 1,
        z: -60,
        duration: 0.45,
        ease: "expo.out",
        overwrite: "auto",
      });
    }
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: ported verbatim from Riven. Keyboard handler + tabIndex below make this div fully operable; a real <button> can't host the 3D-transformed editor subtree without breaking the scene
    <div
      ref={outerRef}
      className="wl-zamp-s2-scene-editor"
      role="button"
      tabIndex={0}
      aria-label="Expand console preview"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      style={{ cursor: "zoom-in" }}
    >
      <div
        ref={shadowRef}
        className="wl-zamp-s2-scene-editor-shadow"
        aria-hidden="true"
      />
      <div ref={liftRef} className="wl-zamp-s2-scene-editor-lift">
        <div ref={poseRef} className="wl-zamp-s2-scene-editor-pose">
          <div
            className="wl-zamp-s2-scene-editor-shot"
            role="img"
            aria-label="Civic teams console, municipal divisions, queue depth, and MTTR"
            style={{
              backgroundImage: "url('/landing-shots/shot-teams.webp')",
            }}
          />
          <div
            ref={glowRef}
            className="wl-zamp-s2-scene-editor-glow"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

function SceneSlot({
  card,
  expanded,
  onToggle,
  expandedKey,
}: {
  card: OrbitCardData;
  expanded: boolean;
  onToggle: (key: string) => void;
  expandedKey: string | null;
}) {
  const pose = SLOT_POSE[card.key];
  const slotRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const slot = slotRef.current;
      const poseEl = poseRef.current;
      if (!slot || !poseEl || !pose) return;

      const mobile = window.matchMedia("(max-width: 900px)").matches;
      if (mobile) return;

      gsap.set(slot, { scale: 1 });
      gsap.set(poseEl, {
        rotateY: pose.rotY,
        rotateX: pose.rotX,
        z: pose.z,
        y: 0,
        scale: pose.baseScale ?? 1,
      });

      // Reduced-motion gate intentionally removed. Idle motion is forced on
      // per product decision (motion is core to the S2 hero scene).

      floatRef.current = gsap.timeline({
        repeat: -1,
        yoyo: true,
        defaults: { ease: "sine.inOut", duration: pose.floatDur },
      });
      floatRef.current.to(poseEl, { y: pose.peakY, z: pose.z + pose.peakZ });
    },
    { scope: slotRef },
  );

  useEffect(() => {
    if (expandedKey) floatRef.current?.pause();
    else floatRef.current?.play();
  }, [expandedKey]);

  const handleEnter = useCallback(() => {
    if (expanded) return;
    floatRef.current?.pause();
    if (slotRef.current) slotRef.current.style.zIndex = "999";
    const counterScale =
      ((SCENE_PERSPECTIVE - HOVER_LIFT_Z) / (SCENE_PERSPECTIVE - pose.z)) *
      (pose.baseScale ?? 1);
    gsap.to(poseRef.current, {
      y: 0,
      z: HOVER_LIFT_Z,
      scale: counterScale,
      duration: 0.55,
      ease: "expo.out",
      overwrite: "auto",
    });
  }, [expanded, pose]);

  const handleLeave = useCallback(() => {
    if (expanded) return;
    if (slotRef.current) slotRef.current.style.zIndex = "";
    gsap.to(poseRef.current, {
      y: 0,
      z: pose.z,
      scale: pose.baseScale ?? 1,
      duration: 0.4,
      ease: "expo.out",
      overwrite: "auto",
      onComplete: () => floatRef.current?.play(0),
    });
  }, [expanded, pose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ported verbatim from Riven, hover handlers only pause the decorative float; the real interactive control is the keyboard-operable OrbitCard child
    <div
      ref={slotRef}
      className={`wl-zamp-s2-scene-slot wl-zamp-s2-scene-slot--${card.key}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div ref={poseRef} className="wl-zamp-s2-scene-slot-pose">
        <div className="wl-zamp-s2-scene-slot-shadow" aria-hidden="true" />
        <OrbitCard card={card} expanded={expanded} onToggle={onToggle} />
      </div>
    </div>
  );
}

export function ZampSection2() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  useEffect(() => {
    if (!expandedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedKey]);

  return (
    <section
      className="wl-zamp-section wl-zamp-s2"
      id="how"
      aria-labelledby="zamp-s2-eyebrow"
    >
      <div className="wl-zamp-s2-header">
        <span id="zamp-s2-eyebrow" className="wl-zamp-eyebrow">
          02 &middot; How it works
        </span>
        <Reveal as="h2" className="wl-zamp-s2-headline" y={20} delay={0.1}>
          One photo. <em>Everything routed.</em>
        </Reveal>
      </div>

      <Reveal as="div" className="wl-zamp-s2-scene" y={36} duration={1.1}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: ported verbatim from Riven, backdrop click only collapses an already-expanded card; Escape (handled below) is the real keyboard dismiss */}
        <div
          className={`wl-zamp-s2-scene-stage${expandedKey ? " has-expanded" : ""}`}
          onClick={() => expandedKey && setExpandedKey(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && expandedKey) setExpandedKey(null);
          }}
        >
          <div className="wl-zamp-s2-scene-floor" aria-hidden="true" />

          <EditorCenterpiece onExpand={() => toggle("editor")} />

          {ORBIT_CARDS.map((c) => (
            <SceneSlot
              key={c.key}
              card={c}
              expanded={expandedKey === c.key}
              onToggle={toggle}
              expandedKey={expandedKey}
            />
          ))}
        </div>
      </Reveal>

      <ExpandedCardModal
        card={
          [EDITOR_CARD, ...ORBIT_CARDS].find((c) => c.key === expandedKey) ||
          null
        }
        onClose={() => setExpandedKey(null)}
      />
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION 3 (Wave 1 open) 60/30/10 row + benefit ticker
   ════════════════════════════════════════════════════════════════ */

const BENEFITS = [
  "Vote on the roadmap",
  "Founding-city badge",
  "Bi-weekly working calls",
  "2-week feature head start",
  "Direct line to the builders",
];

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8h10m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 9V6.5a4.5 4.5 0 119 0V9M4 9h12v8H4V9z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Inline TiltCard, Riven's primitive rebuilt on Civic's useMouseTilt hook.
function TiltCard({
  children,
  className = "",
  glareColor = "rgb(var(--wl-emerald-rgb) / 0.18)",
}: {
  children: ReactNode;
  className?: string;
  glareColor?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMouseTilt(ref, {
    max: 7,
    scale: 1.012,
    perspective: 1000,
    damping: 0.18,
    glare: true,
  });
  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "relative",
        transformStyle: "preserve-3d",
        transition: "transform 350ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {children}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          background: `radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), ${glareColor}, transparent 55%)`,
          mixBlendMode: "screen",
          opacity: 0.9,
          transition: "opacity 220ms ease",
        }}
      />
    </div>
  );
}

export function ZampSection3() {
  const tickerItems = [...BENEFITS, ...BENEFITS];

  return (
    <section
      className="wl-zamp-section wl-zamp-s3"
      id="why-join"
      aria-labelledby="zamp-s3-eyebrow"
    >
      <div className="wl-zamp-s3-header">
        <span id="zamp-s3-eyebrow" className="wl-zamp-eyebrow">
          03 &middot; Wave 1 open
        </span>
        <Reveal as="h2" className="wl-zamp-s3-title" y={22} duration={0.85}>
          Built for the <em>first cities.</em>
        </Reveal>
      </div>

      <StaggerGroup
        className="wl-zamp-s3-row"
        delayChildren={0.1}
        stagger={0.1}
      >
        <StaggerItem>
          <TiltCard className="wl-zamp-s3-card wl-zamp-s3-card--big">
            <div className="wl-zamp-s3-card-head">
              <span className="wl-zamp-s3-card-eyebrow">
                <span className="wl-zamp-s3-dot" aria-hidden="true" />
                Wave 1 &middot; Founding cities
              </span>
              <span className="wl-zamp-s3-card-state">OPEN</span>
            </div>

            <div className="wl-zamp-s3-big-stat">
              <span className="wl-zamp-s3-big-num">Open</span>
              <span className="wl-zamp-s3-big-stat-label">
                Founding cohort &middot; five pilot cities
              </span>
            </div>

            <div className="wl-zamp-s3-bar-meta">
              <span>Cohort open</span>
              <span>Apply to join</span>
            </div>

            <ul className="wl-zamp-s3-card-bullets">
              <li>
                Founding price locks 50% off the public rate &mdash; forever.
              </li>
              <li>Direct line to the founders, vote on the roadmap.</li>
              <li>No procurement maze. Open311 from day one.</li>
            </ul>

            <Link className="wl-zamp-s3-card-cta" href="/teams">
              Claim your slot <ArrowIcon />
            </Link>
          </TiltCard>
        </StaggerItem>

        <StaggerItem>
          <TiltCard className="wl-zamp-s3-card wl-zamp-s3-card--mid">
            <div className="wl-zamp-s3-card-head">
              <span className="wl-zamp-s3-card-eyebrow wl-zamp-s3-card-eyebrow--muted">
                <LockIcon />
                Wave 2 &middot; Early access
              </span>
              <span className="wl-zamp-s3-card-state wl-zamp-s3-card-state--soon">
                SOON
              </span>
            </div>
            <h3 className="wl-zamp-s3-mid-title">Locked until Wave 1 fills.</h3>
            <p className="wl-zamp-s3-mid-body">
              Wave 2 opens when the founding cities are claimed. Same product,
              public pricing &mdash; without the founder rate, working calls, or
              2-week head start.
            </p>
            <span className="wl-zamp-s3-mid-foot">
              Public launch &middot; founding rate locked for the cohort
            </span>
          </TiltCard>
        </StaggerItem>

        <StaggerItem>
          <TiltCard
            className="wl-zamp-s3-card wl-zamp-s3-card--small"
            glareColor="rgba(255, 255, 255, 0.22)"
          >
            <p className="wl-zamp-s3-small-quote">
              <em>Founding price</em> = 50% off.
              <br />
              <span className="wl-zamp-s3-small-quote-tail">Forever.</span>
            </p>
          </TiltCard>
        </StaggerItem>
      </StaggerGroup>

      <div className="wl-zamp-s3-ticker" aria-hidden="true">
        <div className="wl-zamp-s3-ticker-track">
          {tickerItems.map((item, idx) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: duplicated marquee track, index is the stable identity
              key={idx}
              className="wl-zamp-s3-ticker-item"
            >
              <span className="wl-zamp-s3-ticker-bullet">&bull;</span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION 4 (FAQ) magazine inline-expand list
   ════════════════════════════════════════════════════════════════ */

const FAQS = [
  {
    q: "How does the AI actually classify a photo?",
    a: "Gemini 2.5 Flash vision identifies the issue type, severity, and responsible department in about 1.4 seconds at roughly $0.0001 per photo. A human reviewer in the city dashboard can override any classification, and overrides refine future runs.",
  },
  {
    q: "Which cities can residents use Civic in right now?",
    a: "Cumming, Georgia is our resident-first launch city. Residents elsewhere can still file reports, which we forward through the public Open311 endpoint for that jurisdiction when one exists.",
  },
  {
    q: "Does Civic replace the city's existing 311 system?",
    a: "No. Every report is exportable as Open311 GeoReport v2 JSON and XML, so an existing SeeClickFix, Tyler, or in-house backend ingests it natively. When the city is ready, we offer two-way sync instead of a rip-and-replace.",
  },
  {
    q: "What happens to my photo and location data?",
    a: "Faces, plates, and door numbers are blurred before the photo leaves the device. We keep the original only while the report is open, then purge it. Precise GPS routes the work order, then rounds to 30m for the public dashboard.",
  },
  {
    q: "Is it free for residents?",
    a: "Yes, always. The resident PWA, public dashboard, and report tracking are free. Cities pay for the staff console, work order generation, and Open311 sync.",
  },
  {
    q: "Will I get an update when my report is fixed?",
    a: "Yes. You get a push when the work order is dispatched and another with the resolution photo when the crew marks it complete. Updates are also public on the dashboard without an account.",
  },
  {
    q: "What if the department gets the report and ignores it?",
    a: "Every report is public on the city dashboard with a timestamp and status. Cities that miss their stated SLA appear at the top of the accountability page. The dashboard exists exactly so 'lost' reports cannot stay lost.",
  },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function ZampSection4() {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <section
      className="wl-zamp-section wl-zamp-s4"
      id="faq"
      aria-labelledby="zamp-s4-eyebrow"
    >
      <div className="wl-zamp-s4-head">
        <span id="zamp-s4-eyebrow" className="wl-zamp-s4-eyebrow">
          04 / Frequently asked
        </span>
        <span className="wl-zamp-s4-kicker">
          Seven things <em>worth</em> asking, answered straight.
        </span>
      </div>

      <Reveal as="h2" className="wl-zamp-s4-title" y={22} duration={0.85}>
        Things <em>worth</em> asking.
      </Reveal>

      <div className="wl-zamp-s4-grid">
        <div className="wl-zamp-s4-main">
          <StaggerGroup
            as="ol"
            className="wl-zamp-s4-list"
            delayChildren={0.05}
            stagger={0.04}
            amount={0.08}
          >
            {FAQS.map((item, idx) => {
              const isOpen = idx === openIdx;
              const rowId = `zamp-faq-row-${idx}`;
              const panelId = `zamp-faq-panel-${idx}`;
              return (
                <StaggerItem
                  as="li"
                  key={rowId}
                  className={`wl-zamp-s4-row ${isOpen ? "is-open" : ""}`}
                  y={20}
                >
                  <button
                    type="button"
                    id={rowId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="wl-zamp-s4-trigger"
                    onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                  >
                    <span className="wl-zamp-s4-numeral" aria-hidden="true">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="wl-zamp-s4-q">{item.q}</span>
                    <span className="wl-zamp-s4-mark" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key={panelId}
                        id={panelId}
                        role="region"
                        aria-labelledby={rowId}
                        className="wl-zamp-s4-panel"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: { duration: 0.42, ease: EASE_OUT },
                          opacity: {
                            duration: 0.28,
                            ease: EASE_OUT,
                            delay: isOpen ? 0.08 : 0,
                          },
                        }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="wl-zamp-s4-panel-inner">
                          <p className="wl-zamp-s4-a">{item.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        </div>

        <aside className="wl-zamp-s4-aside" aria-label="Ask a question">
          <Reveal y={24} duration={0.7} className="wl-zamp-s4-card">
            <div className="wl-zamp-s4-card-eyebrow">Direct line</div>
            <h3 className="wl-zamp-s4-card-title">
              Have a <em>question?</em>
            </h3>
            <p className="wl-zamp-s4-card-sub">
              Yours doesn&rsquo;t fit the seven above. Talk to the team behind
              the pilot &mdash; we read every message and reply within a day.
            </p>
            <Link className="wl-zamp-s4-cta" href="/teams">
              Talk to a city team
              <span aria-hidden="true" className="wl-zamp-s4-cta-arrow">
                →
              </span>
            </Link>
          </Reveal>
        </aside>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
   SECTION 5 (Final CTA) wordmark reprise + CTA
   ════════════════════════════════════════════════════════════════ */

function HeroCtaPair() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
      }}
    >
      <Link href="/report" className="wl-pill-btn">
        Report an issue <ArrowIcon />
      </Link>
      <Link href="/city/cumming" className="wl-pill-btn wl-pill-btn--ghost">
        See the live dashboard
      </Link>
    </div>
  );
}

export function ZampSection5() {
  return (
    <section
      className="wl-zamp-section wl-zamp-s5"
      id="join"
      aria-labelledby="zamp-s5-headline"
    >
      <StaggerGroup
        className="wl-zamp-s5-inner"
        delayChildren={0.08}
        stagger={0.1}
      >
        <StaggerItem as="span" className="wl-zamp-s5-pre">
          READY?
        </StaggerItem>

        <Reveal as="h2" className="wl-zamp-s5-wordmark" y={30} duration={1.0}>
          Civic
        </Reveal>

        <StaggerItem
          as="p"
          id="zamp-s5-headline"
          className="wl-zamp-s5-headline"
        >
          The 311 that won&rsquo;t lose your report.
        </StaggerItem>

        <StaggerItem className="wl-zamp-s5-form">
          <HeroCtaPair />
        </StaggerItem>

        <StaggerItem as="p" className="wl-zamp-s5-reassure">
          One photo &middot; Open311 native &middot; public by default
        </StaggerItem>

        <StaggerItem as="p" className="wl-zamp-s5-credit">
          Built in Cumming, GA &middot;{" "}
          <Link href="/teams">Bring Civic to your city</Link>
        </StaggerItem>
      </StaggerGroup>
    </section>
  );
}

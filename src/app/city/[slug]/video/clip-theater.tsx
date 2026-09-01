"use client";

/**
 * Clip playback theater: pick a clip from the recent-clips list, watch it play
 * with the detector's per-frame boxes drawn over it, and follow each detection
 * as the playhead crosses it — waiting → analyzing → drafting → settled — with
 * the generated report expandable inline in the rail.
 *
 * This is a REPLAY of a pipeline run that already completed on the server; the
 * rail narrates that run against the playhead, it does not run inference now.
 *
 * Render discipline: the playhead itself never lives in React state. A single
 * `syncTime` writes it to a ref and pushes it into two imperative handles (the
 * overlay, the rail) plus two DOM nodes (the seek slider, the clock). Each of
 * those decides for itself whether anything actually changed, so a 60 Hz rAF
 * costs at most ~25 tiny overlay renders/sec and a handful of rail renders per
 * clip instead of re-rendering the whole stage every frame.
 *
 * Selection state is shared between the stage (top of the page) and the clip
 * list (bottom) through a context provider that wraps the page's children, so
 * the teammate's section order is untouched.
 */

import {
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toneChipClass, toneTextClass } from "@/lib/status";
import { CLIP_TONE, CLUSTER_TONE, detectionHue } from "./detection-colors";
import { type DetectionBox, EvidenceFrameButton } from "./evidence-frame";
import { type GeneratedReport, ReportInline } from "./report-inline";
import { ClusterRowActions } from "./video-console";

export interface TheaterEvent {
  clusterId: string;
  /** Seconds into the clip the detection's first frame was sampled at. */
  tsSeconds: number;
  class: string;
  confidence: number;
  frameUrl: string | null;
  /** Detector box for `frameUrl`, normalized 0..1 top-left. */
  frameBox: DetectionBox | null;
  /** e.g. "pothole · 0.87" — drawn on the box in the full-frame modal. */
  frameLabel: string | null;
  report: GeneratedReport | null;
  /** Raw cluster status — drives whether a manual decision can be run. */
  status: string;
  /** Human label for `status` ("Needs manual dispatch", …). */
  statusLabel: string;
  frameCount: number;
  decision: string | null;
  decisionRationale: string | null;
  /** Storage path of the best frame, only when no signed URL could be minted. */
  framePath: string | null;
  /**
   * Cluster that no clip in the picker can replay (no clip association, an
   * unusable timestamp, or a clip outside the recent-clips window). It is
   * pinned to the end of every rail rather than being silently dropped.
   */
  unlinked?: boolean;
}

export interface TheaterClip {
  id: string;
  createdAt: string;
  status: string;
  framesSampled: number | null;
  detectionsFound: number | null;
  error: string | null;
  /** Short-lived signed URL for the raw clip; null when nothing is stored. */
  videoUrl: string | null;
  /** Per-frame detector output, only when it belongs to THIS clip. */
  detectionsUrl: string | null;
  events: TheaterEvent[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}
interface DetectionTrack {
  fps: number;
  byFrame: Map<number, Box[]>;
}

/** Anything the playhead drives without going through the parent's render. */
interface ScrubHandle {
  sync: (time: number) => void;
}

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";
const TH =
  "px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint";
const TRANSPORT_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline text-subtle outline-none transition-colors hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60";

/** mm:ss for the transport readout; NaN duration before metadata loads. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** How long the replayed assess-and-write step is stretched over, in seconds. */
const ASSESS_WINDOW_S = 0.8;

interface StudioContext {
  clips: TheaterClip[];
  /** Clusters no clip can replay — appended to whichever rail is on screen. */
  orphanEvents: TheaterEvent[];
  /** City slug — the rail links reports into that city's work-order grid. */
  slug: string;
  /** Real staff. False on the public demo console, where the decision
   *  controls are hidden rather than shown and refused by the server. */
  canWrite: boolean;
  selectedId: string | null;
  /** Bumped only by user clicks, so the default selection never scrolls. */
  scrollToken: number;
  select: (id: string) => void;
  /** The rail's "on other clips" line expands the clip picker below. */
  listOpen: boolean;
  revealClipList: () => void;
}

const Ctx = createContext<StudioContext | null>(null);

export function ClipStudioProvider({
  clips,
  orphanEvents = [],
  slug,
  canWrite,
  children,
}: {
  clips: TheaterClip[];
  orphanEvents?: TheaterEvent[];
  slug: string;
  canWrite: boolean;
  children: ReactNode;
}) {
  const initial = useMemo(
    () => clips.find((c) => c.videoUrl)?.id ?? clips[0]?.id ?? null,
    [clips],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [scrollToken, setScrollToken] = useState(0);
  const [listOpen, setListOpen] = useState(false);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setScrollToken((n) => n + 1);
  }, []);

  const revealClipList = useCallback(() => {
    setListOpen(true);
    // The <details> has to be open before it can be scrolled to meaningfully.
    requestAnimationFrame(() =>
      document
        .getElementById("clip-list")
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, []);

  const value = useMemo<StudioContext>(
    () => ({
      clips,
      orphanEvents,
      slug,
      canWrite,
      selectedId,
      scrollToken,
      select,
      listOpen,
      revealClipList,
    }),
    [
      clips,
      orphanEvents,
      slug,
      canWrite,
      selectedId,
      scrollToken,
      select,
      listOpen,
      revealClipList,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useStudio(): StudioContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Clip theater used outside ClipStudioProvider");
  return ctx;
}

/** Nearest frame within ±1 index, so boxes hold instead of strobing. */
function boxesAtFrame(track: DetectionTrack | null, index: number): Box[] {
  if (!track) return [];
  for (const candidate of [index, index - 1, index + 1]) {
    const boxes = track.byFrame.get(candidate);
    if (boxes?.length) return boxes;
  }
  return [];
}

export function ClipStage() {
  const { clips, slug, canWrite, selectedId, scrollToken } = useStudio();
  const sectionRef = useRef<HTMLElement>(null);
  const clip = clips.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (scrollToken === 0) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToken]);

  if (!clip) return null;

  return (
    <section
      id="clip-theater"
      ref={sectionRef}
      className="scroll-mt-4 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={EYEBROW}>Clip theater</h2>
        <p className="font-mono text-[11px] text-faint">
          {new Date(clip.createdAt).toLocaleString()} ·{" "}
          <span className={toneTextClass(CLIP_TONE[clip.status] ?? "neutral")}>
            {clip.status}
          </span>
        </p>
      </div>
      {/* Remount per clip so playhead, overlay track and media errors reset. */}
      <StageBody key={clip.id} clip={clip} slug={slug} canWrite={canWrite} />
    </section>
  );
}

function StageBody({
  clip,
  slug,
  canWrite,
}: {
  clip: TheaterClip;
  slug: string;
  canWrite: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [track, setTrack] = useState<DetectionTrack | null>(null);

  // Playhead consumers. None of these re-render StageBody.
  const timeRef = useRef(0);
  const overlayRef = useRef<ScrubHandle>(null);
  const railRef = useRef<ScrubHandle>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);

  const detectionsUrl = clip.detectionsUrl;
  useEffect(() => {
    if (!detectionsUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(detectionsUrl);
        if (!res.ok) return;
        const json = (await res.json()) as {
          fps: number;
          frames: { i: number; boxes: Box[] }[];
        };
        if (cancelled) return;
        const byFrame = new Map<number, Box[]>();
        for (const frame of json.frames) byFrame.set(frame.i, frame.boxes);
        setTrack({ fps: json.fps || 25, byFrame });
      } catch {
        // Overlay is an enhancement — a missing track just means no boxes.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detectionsUrl]);

  /** The single funnel every playhead source goes through. Ref-only, stable. */
  const syncTime = useCallback((seconds: number) => {
    timeRef.current = seconds;
    overlayRef.current?.sync(seconds);
    railRef.current?.sync(seconds);
    // The slider and clock are written imperatively: at 60 Hz these would
    // otherwise be the one thing forcing a full stage render every frame.
    const slider = seekRef.current;
    if (slider && document.activeElement !== slider)
      slider.value = String(seconds);
    if (clockRef.current) clockRef.current.textContent = formatClock(seconds);
  }, []);

  // rAF while playing: `timeupdate` fires ~4x/s, far too coarse for boxes.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) syncTime(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, syncTime]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, seconds);
      syncTime(video.currentTime);
      void video.play().catch(() => {
        /* autoplay refusal is harmless — the seek still landed */
      });
    },
    [syncTime],
  );

  // Transport controls. The overlay covers the frame, so the browser's own
  // hover-revealed control bar is easy to miss — this bar is always visible
  // and carries the scrub/skip affordances the native one would.
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, []);

  const nudge = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.min(
        video.duration || Number.POSITIVE_INFINITY,
        Math.max(0, video.currentTime + delta),
      );
      syncTime(video.currentTime);
    },
    [syncTime],
  );

  const restart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    syncTime(0);
  }, [syncTime]);

  const playable = clip.videoUrl && !mediaError;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <div className="flex min-w-0 flex-1 flex-col 2xl:max-w-[1100px]">
        {playable ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-overlay">
            {/* biome-ignore lint/a11y/useMediaCaption: dashcam footage has no dialogue */}
            <video
              ref={videoRef}
              src={clip.videoUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              data-testid="clip-video"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(e) => syncTime(e.currentTarget.currentTime)}
              onSeeked={(e) => syncTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onError={() => setMediaError(true)}
              className="absolute inset-0 h-full w-full"
            />
            <DetectionOverlay ref={overlayRef} track={track} />
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-hairline-strong bg-overlay text-center">
            <HelpCircle className="h-6 w-6 text-faint" strokeWidth={1.5} />
            <p className="text-[13px] text-subtle">No playable media</p>
            <p className="max-w-xs text-[12px] text-faint">
              This clip has no stored video object — its detections are still
              listed below.
            </p>
          </div>
        )}
        {playable && (
          <div
            data-testid="clip-transport"
            className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-hairline bg-surface px-2 py-1.5"
          >
            <button
              type="button"
              onClick={restart}
              aria-label="Restart clip"
              title="Restart"
              className={TRANSPORT_BTN}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => nudge(-5)}
              aria-label="Back 5 seconds"
              title="Back 5s"
              className={TRANSPORT_BTN}
            >
              <SkipBack className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : "Play"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-contrast outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={() => nudge(5)}
              aria-label="Forward 5 seconds"
              title="Forward 5s"
              className={TRANSPORT_BTN}
            >
              <SkipForward className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            {/* Uncontrolled on purpose — `syncTime` writes `.value` directly. */}
            <input
              ref={seekRef}
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              defaultValue={0}
              onChange={(e) => {
                const next = Number(e.target.value);
                const video = videoRef.current;
                if (video) video.currentTime = next;
                syncTime(next);
              }}
              aria-label="Seek"
              className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-overlay-strong accent-[var(--accent)]"
            />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
              <span ref={clockRef}>0:00</span> / {formatClock(duration)}
            </span>
          </div>
        )}
        <p className="mt-2 text-[12px] text-faint">
          {/* Keyed off the prop, not the fetched track: the track is always
              null on the server, and a caption that flips after hydration
              reads like a failure. */}
          {clip.detectionsUrl
            ? "Boxes are the detector's own per-frame output, drawn live against the playhead."
            : "No per-frame overlay is published for this clip."}
        </p>
      </div>

      <DetectionRail
        slug={slug}
        ref={railRef}
        events={clip.events}
        onSeek={seekTo}
        seekable={Boolean(playable)}
        paused={!playing}
      />
    </div>
  );
}

/**
 * Detector boxes for the current frame. Owns its own frame index so the
 * playhead can drive it at video fps without touching the stage or the rail.
 */
function DetectionOverlay({
  track,
  ref,
}: {
  track: DetectionTrack | null;
  ref: Ref<ScrubHandle>;
}) {
  const [frameIdx, setFrameIdx] = useState(0);
  const fps = track?.fps ?? 25;

  useImperativeHandle(
    ref,
    () => ({
      sync(seconds: number) {
        const next = Math.round(seconds * fps);
        setFrameIdx((prev) => (prev === next ? prev : next));
      },
    }),
    [fps],
  );

  const boxes = useMemo(() => boxesAtFrame(track, frameIdx), [track, frameIdx]);

  return (
    <>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden
        data-testid="detector-overlay"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <title>Detector overlay</title>
        {/* The published per-frame track carries geometry and confidence only —
            no class — so these boxes stay on the neutral detector blush rather
            than claiming a class hue they cannot know. */}
        {boxes.map((box) => (
          <rect
            key={`${box.x}-${box.y}-${box.w}`}
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            rx={0.004}
            fill="color-mix(in srgb, var(--pastel-blush-strong) 12%, transparent)"
            stroke="var(--pastel-blush-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {/* Labels live in HTML, not SVG — a 0..1 viewBox with
          preserveAspectRatio="none" would stretch <text> glyphs. */}
      <div className="pointer-events-none absolute inset-0">
        {boxes.map((box) => (
          <span
            key={`label-${box.x}-${box.y}-${box.w}`}
            className="absolute -translate-y-full rounded-t-[3px] px-1 font-mono text-[10px] leading-[1.4] text-[var(--pastel-blush-strong)]"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              backgroundColor:
                "color-mix(in srgb, var(--pastel-blush-strong) 16%, transparent)",
            }}
          >
            {box.conf.toFixed(2)}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Phase buckets a detection walks through as the playhead crosses it. Only
 * bucket *changes* reach React, so a 20-item rail renders a few times per
 * clip rather than once per animation frame.
 */
type EventPhase = "waiting" | "analyzing" | "drafting" | "settled";

function phaseOf(time: number, tsSeconds: number): EventPhase {
  if (time < tsSeconds) return "waiting";
  if (time < tsSeconds + ASSESS_WINDOW_S / 2) return "analyzing";
  if (time < tsSeconds + ASSESS_WINDOW_S) return "drafting";
  return "settled";
}

function DetectionRail({
  events,
  slug,
  onSeek,
  seekable,
  paused,
  ref,
}: {
  events: TheaterEvent[];
  slug: string;
  onSeek: (seconds: number) => void;
  seekable: boolean;
  paused: boolean;
  ref: Ref<ScrubHandle>;
}) {
  const { clips, orphanEvents, revealClipList, selectedId } = useStudio();
  // Clip-bound detections first (they narrate the playhead), then the ones no
  // clip can replay — deleting the standalone Detections list made this rail
  // the only surface, so nothing may fall out of it.
  const items = useMemo(
    () => [...events, ...orphanEvents],
    [events, orphanEvents],
  );
  // Clusters that belong to a DIFFERENT clip: reachable, just not from here.
  const otherCount = clips.reduce(
    (sum, clip) => sum + (clip.id === selectedId ? 0 : clip.events.length),
    0,
  );

  const initialPhase = (event: TheaterEvent): EventPhase =>
    event.unlinked ? "settled" : "waiting";
  const [phases, setPhases] = useState<EventPhase[]>(() =>
    items.map(initialPhase),
  );
  const phasesRef = useRef(phases);
  // How far past its timestamp an item was when it entered the assess window.
  // Written only at a bucket change, so reading it in render is stable and
  // never invalidates a memoized card mid-playback.
  const offsetsRef = useRef<number[]>(items.map(() => 0));

  useImperativeHandle(
    ref,
    () => ({
      sync(seconds: number) {
        const prev = phasesRef.current;
        let changed = false;
        const next = items.map((event, i) => {
          // An unlinked cluster has no timestamp on this clip — it is already
          // decided, and must never read as "waiting for playhead".
          const phase = event.unlinked
            ? "settled"
            : phaseOf(seconds, event.tsSeconds);
          if (phase !== prev[i]) {
            changed = true;
            offsetsRef.current[i] = Math.max(0, seconds - event.tsSeconds);
          }
          return phase;
        });
        if (!changed) return;
        phasesRef.current = next;
        setPhases(next);
      },
    }),
    [items],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 lg:w-[340px] lg:flex-shrink-0 xl:w-[420px] 2xl:w-[480px]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={EYEBROW}>Detection feed</h3>
        <span className="font-mono text-[11px] tabular-nums text-faint">
          {items.length}
        </span>
      </div>
      <p className="text-[12px] leading-snug text-faint">
        Replay of a completed run — detected → assessed → report created. Expand
        an item for its decision, evidence frame and controls.
      </p>
      {items.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-hairline bg-overlay p-3 text-[13px] text-subtle">
          No clustered detections on this clip.
        </p>
      ) : (
        // The rail never sets the row height: on desktop it fills the video
        // column and scrolls inside it, so 20 items don't stretch the page.
        <div className="relative min-h-0 flex-1">
          <ol
            data-testid="detection-rail"
            className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pr-1 lg:absolute lg:inset-0 lg:max-h-none"
          >
            {items.map((event, i) => (
              <li key={event.clusterId}>
                {event.unlinked && i === events.length && (
                  <p
                    className={`${EYEBROW} mb-2 border-t border-hairline pt-2`}
                  >
                    Not tied to this clip
                  </p>
                )}
                <EventCard
                  event={event}
                  slug={slug}
                  phase={phases[i] ?? initialPhase(event)}
                  scanOffset={offsetsRef.current[i] ?? 0}
                  paused={paused}
                  onSeek={onSeek}
                  seekable={seekable}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
      {otherCount > 0 && (
        // The feed is scoped to the clip on screen. With a second clip in the
        // city this line is the only thing that says so — and the way out.
        <button
          type="button"
          onClick={revealClipList}
          data-testid="other-clip-clusters"
          className="self-start text-left font-mono text-[11px] text-faint underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-foreground"
        >
          {otherCount} more on other clips — pick a clip below
        </button>
      )}
    </div>
  );
}

/* A card carries TWO colors and they encode different things: the ring is the
   replay STATE (working / settled / dispatched), so it draws from the semantic
   --status-* tokens like every other state in the app; the 3px left edge is the
   detector CLASS, so it draws from the categorical pastel ramp. State moved off
   pastel-sky/mint deliberately — those hues now belong to two damage classes,
   and one hue cannot mean both "transverse crack" and "analyzing". */
// Mixed toward transparent: the raw --status-* tokens are system-bright and a
// full-strength ring on every card turns the rail neon, especially on dark.
const WORKING_RING =
  "border-[color-mix(in_srgb,var(--status-info-fg)_55%,transparent)]";
const DISPATCHED_RING =
  "border-[color-mix(in_srgb,var(--status-success-fg)_42%,transparent)]";

const PHASE_RING: Record<EventPhase, string> = {
  waiting: "border-hairline",
  analyzing: WORKING_RING,
  drafting: WORKING_RING,
  settled: "border-hairline-strong",
};

/**
 * Class dot · class name · confidence meter — the header line shared by the
 * card's two mutually exclusive affordances (report link / seek button), so the
 * two can never drift apart. The meter's LENGTH is the magnitude a bare
 * two-decimal number makes you read; its hue repeats the class, which is why
 * confidence needs no hue of its own.
 */
function EventHeadline({
  event,
  hue,
}: {
  event: TheaterEvent;
  hue: { fill: string; strong: string };
}) {
  const pct = Math.max(0, Math.min(1, event.confidence)) * 100;
  return (
    <>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: hue.strong }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {event.class}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className="block h-1 w-8 overflow-hidden rounded-full bg-overlay-strong"
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: hue.strong }}
          />
        </span>
        <span className="font-mono text-[11px] tabular-nums text-subtle">
          {event.confidence.toFixed(2)}
        </span>
      </span>
    </>
  );
}

const EventCard = memo(function EventCard({
  event,
  slug,
  phase,
  scanOffset,
  paused,
  onSeek,
  seekable,
}: {
  event: TheaterEvent;
  slug: string;
  phase: EventPhase;
  /** Seconds into the assess window when this card entered it. */
  scanOffset: number;
  paused: boolean;
  onSeek: (seconds: number) => void;
  seekable: boolean;
}) {
  // Read from context rather than taking a prop: EventCard is memoized, and an
  // extra prop that never changes would only widen its comparison surface.
  const { canWrite } = useStudio();
  const scanning = phase === "analyzing" || phase === "drafting";
  const dispatched = Boolean(event.report);
  const showReport = dispatched && phase !== "waiting";
  const thumbUrl = event.frameUrl ?? event.report?.imageUrl ?? null;
  const ring =
    phase === "settled" && dispatched ? DISPATCHED_RING : PHASE_RING[phase];
  const hue = detectionHue(event.class);

  return (
    <div
      data-testid="detection-item"
      data-phase={phase}
      // The class hue is carried by the dot beside the class name, not by a
      // thick left edge on the card — a colored side tab is a stock
      // AI-dashboard tell and it double-encodes what the dot already says.
      className={`overflow-hidden rounded-[var(--radius-md)] border bg-surface transition-colors ${ring} ${phase === "waiting" ? "opacity-60" : ""}`}
    >
      {/* Two affordances, deliberately split: the timestamp scrubs the clip,
          the rest of the header opens the thing the detection became. A
          detection with no report has nothing to open, so there the body
          seeks too. Siblings, not nested — an anchor cannot contain a
          button. */}
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => onSeek(event.tsSeconds - 0.5)}
          disabled={!seekable || Boolean(event.unlinked)}
          aria-label={`Seek clip to ${event.tsSeconds.toFixed(2)} seconds`}
          data-testid="detection-ts"
          className="-mx-1 shrink-0 rounded px-1 font-mono text-[11px] tabular-nums text-faint outline-none transition-colors hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-faint"
        >
          {event.unlinked ? "—" : `${event.tsSeconds.toFixed(2)}s`}
        </button>
        {event.report ? (
          <Link
            href={`/city/${slug}/grid?report=${event.report.id}`}
            data-testid="detection-open"
            className="-my-2 flex min-w-0 flex-1 items-center gap-2 py-2 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <EventHeadline event={event} hue={hue} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onSeek(event.tsSeconds - 0.5)}
            disabled={!seekable}
            className="-my-2 flex min-w-0 flex-1 items-center gap-2 py-2 text-left transition-colors disabled:cursor-default"
          >
            <EventHeadline event={event} hue={hue} />
          </button>
        )}
      </div>

      <div className="px-3 pb-2 text-[12px] leading-tight">
        {phase === "waiting" && (
          <span className="text-faint">Waiting for playhead</span>
        )}
        {scanning && (
          <span className="inline-flex items-center gap-1.5 text-[var(--status-info-fg)]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--status-info-fg)]"
              aria-hidden
            />
            {phase === "analyzing" ? "Analyzing frame…" : "Drafting report…"}
          </span>
        )}
        {phase === "settled" && (
          <span
            className={`inline-flex items-center gap-1.5 ${dispatched ? "text-[var(--status-success-fg)]" : "text-[var(--status-warning-fg)]"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${dispatched ? "bg-[var(--status-success-fg)]" : "bg-[var(--status-warning-fg)]"}`}
              aria-hidden
            />
            {/* Never invent a state: an undispatched cluster reads out its
                own status ("Candidate", "Needs manual dispatch", …) rather
                than a blanket "monitoring". */}
            {dispatched ? "Report created" : event.statusLabel}
          </span>
        )}
        {scanning && (
          // Determinate: the window is a known 0.8s, and a negative delay
          // drops a mid-window seek straight into the matching fill position.
          // prefers-reduced-motion renders the bar full, with no animation.
          <span
            data-testid="scan-progress"
            aria-hidden
            className="mt-1.5 block h-[3px] w-full overflow-hidden rounded-full bg-overlay-strong"
          >
            <span
              className="clip-scan-bar block h-full w-full rounded-full bg-[var(--status-info-fg)]"
              style={
                {
                  "--clip-scan-duration": `${ASSESS_WINDOW_S}s`,
                  "--clip-scan-delay": `-${scanOffset.toFixed(2)}s`,
                  animationPlayState: paused ? "paused" : "running",
                } as React.CSSProperties
              }
            />
          </span>
        )}
      </div>

      {/* One disclosure per cluster, always present — it is the only place the
          decision, the evidence frame and the manual controls live now that
          the standalone Detections list is gone. The summary still says
          "Report" once the playhead has passed a dispatched cluster, so the
          replay keeps its reveal. */}
      <details className="border-t border-hairline">
        <summary
          className={`${EYEBROW} cursor-pointer select-none px-3 py-2 transition-colors hover:text-subtle`}
        >
          {showReport ? "Report" : "Details"}
        </summary>
        <div
          data-testid={showReport ? "report-body" : "cluster-details"}
          className="flex flex-col gap-2 border-t border-hairline px-3 py-2"
        >
          {thumbUrl && (
            <EvidenceFrameButton
              src={thumbUrl}
              box={event.frameBox}
              label={event.frameLabel ?? undefined}
              alt={`Evidence frame for ${event.class}`}
              title={event.class}
              subtitle={
                event.unlinked
                  ? `${event.confidence.toFixed(2)} confidence · ${event.frameCount} frames`
                  : `${event.confidence.toFixed(2)} confidence at ${event.tsSeconds.toFixed(2)}s`
              }
              className="h-24 w-full rounded-[var(--radius-md)] border border-hairline"
            />
          )}

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle leading-tight">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${toneChipClass(
                CLUSTER_TONE[event.status] ?? "neutral",
              )}`}
            >
              {event.statusLabel}
            </span>
            <span className="tabular-nums">
              {event.confidence.toFixed(2)} conf
            </span>
            <span className="tabular-nums text-faint">
              {event.frameCount} frames
            </span>
          </p>

          {event.decision && (
            <div className="text-[12px] leading-snug">
              <span className="font-medium text-subtle">{event.decision}</span>
              {event.decisionRationale && (
                <p className="mt-0.5 text-faint">{event.decisionRationale}</p>
              )}
            </div>
          )}

          {showReport && event.report && (
            <ReportInline report={event.report} clampDescription={false} />
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Manual stage-2 trigger + the frame pop-out fallback. Without
                this a candidate cluster would have no way to be decided.
                Hidden for public demo viewers: the server action refuses them
                anyway, and a button that always errors is worse than none. */}
            {canWrite && (
              <ClusterRowActions
                slug={slug}
                clusterId={event.clusterId}
                status={event.status}
                framePath={event.framePath}
              />
            )}
            {event.report && (
              <Link
                className="text-xs text-faint underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-foreground"
                href={`/city/${slug}/grid?report=${event.report.id}`}
              >
                Open in grid →
              </Link>
            )}
          </div>
        </div>
      </details>
    </div>
  );
});

/** The recent-clips log — same five columns, now a clip picker. */
export function ClipList() {
  const { clips, selectedId, select, listOpen } = useStudio();
  const needsAttention = clips.some(
    (c) => c.status === "failed" || c.status === "processing",
  );

  return (
    <details
      id="clip-list"
      data-tour="video-clips"
      open={needsAttention || listOpen || undefined}
      className="rounded-[var(--radius-lg)] border border-hairline bg-surface"
    >
      <summary
        className={`${EYEBROW} cursor-pointer select-none px-4 py-3 transition-colors hover:text-subtle`}
      >
        Recent clips ({clips.length}) — click one to play it
      </summary>
      <div className="overflow-x-auto border-t border-hairline">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline">
              <th className={TH}>Uploaded</th>
              <th className={TH}>Status</th>
              <th className={TH}>Frames</th>
              <th className={TH}>Detections</th>
              <th className={TH}>Error</th>
            </tr>
          </thead>
          <tbody>
            {clips.map((clip) => {
              const active = clip.id === selectedId;
              return (
                <tr
                  key={clip.id}
                  data-testid="clip-row"
                  className={`border-b border-hairline transition-colors hover:bg-overlay ${active ? "bg-overlay" : ""}`}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => select(clip.id)}
                      aria-current={active ? "true" : undefined}
                      className="text-left underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-foreground"
                    >
                      {new Date(clip.createdAt).toLocaleString()}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {/* Run state, not a category — the shared status tones, so
                        a failed clip reads red here exactly as it would in the
                        grid. */}
                    <span
                      className={toneTextClass(
                        CLIP_TONE[clip.status] ?? "neutral",
                      )}
                    >
                      {clip.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {clip.framesSampled ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {clip.detectionsFound ?? "—"}
                  </td>
                  <td className="max-w-80 truncate px-3 py-2 text-xs text-subtle">
                    {clip.error ?? ""}
                  </td>
                </tr>
              );
            })}
            {clips.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-faint" colSpan={5}>
                  No clips yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

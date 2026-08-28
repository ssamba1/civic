"use client";

/**
 * Clip playback theater: pick a clip from the recent-clips list, watch it play
 * with the detector's per-frame boxes drawn over it, and follow each detection
 * as the playhead crosses it — pending → detecting → report created — with the
 * generated report expandable inline in the rail.
 *
 * Selection state is shared between the stage (top of the page) and the clip
 * list (bottom) through a context provider that wraps the page's children, so
 * the teammate's section order is untouched.
 */

import { HelpCircle } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type GeneratedReport, ReportInline } from "./report-inline";

export interface TheaterEvent {
  clusterId: string;
  /** Seconds into the clip the detection's first frame was sampled at. */
  tsSeconds: number;
  class: string;
  confidence: number;
  frameUrl: string | null;
  report: GeneratedReport | null;
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

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";
const TH =
  "px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint";

/** How long a detection stays in the "generating" state after its timestamp. */
const DETECTING_WINDOW_S = 0.8;

interface StudioContext {
  clips: TheaterClip[];
  selectedId: string | null;
  /** Bumped only by user clicks, so the default selection never scrolls. */
  scrollToken: number;
  select: (id: string) => void;
}

const Ctx = createContext<StudioContext | null>(null);

export function ClipStudioProvider({
  clips,
  children,
}: {
  clips: TheaterClip[];
  children: ReactNode;
}) {
  const initial = useMemo(
    () => clips.find((c) => c.videoUrl)?.id ?? clips[0]?.id ?? null,
    [clips],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [scrollToken, setScrollToken] = useState(0);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setScrollToken((n) => n + 1);
  }, []);

  const value = useMemo<StudioContext>(
    () => ({ clips, selectedId, scrollToken, select }),
    [clips, selectedId, scrollToken, select],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useStudio(): StudioContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Clip theater used outside ClipStudioProvider");
  return ctx;
}

/** Nearest frame within ±1 index, so boxes hold instead of strobing. */
function boxesAt(track: DetectionTrack | null, time: number): Box[] {
  if (!track) return [];
  const idx = Math.round(time * track.fps);
  for (const candidate of [idx, idx - 1, idx + 1]) {
    const boxes = track.byFrame.get(candidate);
    if (boxes?.length) return boxes;
  }
  return [];
}

export function ClipStage() {
  const { clips, selectedId, scrollToken } = useStudio();
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
          {new Date(clip.createdAt).toLocaleString()} · {clip.status}
        </p>
      </div>
      {/* Remount per clip so playhead, overlay track and media errors reset. */}
      <StageBody key={clip.id} clip={clip} />
    </section>
  );
}

function StageBody({ clip }: { clip: TheaterClip }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [track, setTrack] = useState<DetectionTrack | null>(null);

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

  // rAF while playing: `timeupdate` fires ~4x/s, far too coarse for boxes.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setTime(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, seconds);
    setTime(video.currentTime);
    void video.play().catch(() => {
      /* autoplay refusal is harmless — the seek still landed */
    });
  }, []);

  const boxes = boxesAt(track, time);
  const playable = clip.videoUrl && !mediaError;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        {playable ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-overlay">
            {/* biome-ignore lint/a11y/useMediaCaption: dashcam footage has no dialogue */}
            <video
              ref={videoRef}
              src={clip.videoUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setTime(e.currentTarget.currentTime)}
              onError={() => setMediaError(true)}
              className="absolute inset-0 h-full w-full"
            />
            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <title>Detector overlay</title>
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
        <p className="mt-2 text-[12px] text-faint">
          {/* Keyed off the prop, not the fetched track: the track is always
              null on the server, and a caption that flips after hydration
              reads like a failure. */}
          {clip.detectionsUrl
            ? "Boxes are the detector's own per-frame output, drawn live against the playhead."
            : "No per-frame overlay is published for this clip."}
        </p>
      </div>

      <div className="flex w-full flex-shrink-0 flex-col gap-2 lg:w-[320px]">
        <h3 className={EYEBROW}>Detection feed</h3>
        {clip.events.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-hairline bg-overlay p-3 text-[13px] text-subtle">
            No clustered detections on this clip.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {clip.events.map((event) => (
              <li key={event.clusterId}>
                <EventCard
                  event={event}
                  time={time}
                  onSeek={() => seekTo(event.tsSeconds - 0.5)}
                  seekable={Boolean(playable)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

type EventPhase = "pending" | "detecting" | "reported";

function phaseOf(time: number, tsSeconds: number): EventPhase {
  if (time < tsSeconds) return "pending";
  if (time < tsSeconds + DETECTING_WINDOW_S) return "detecting";
  return "reported";
}

const PHASE_RING: Record<EventPhase, string> = {
  pending: "border-hairline",
  detecting: "border-[var(--pastel-sky-strong)]",
  reported: "border-[var(--pastel-mint-strong)]",
};

function EventCard({
  event,
  time,
  onSeek,
  seekable,
}: {
  event: TheaterEvent;
  time: number;
  onSeek: () => void;
  seekable: boolean;
}) {
  const phase = phaseOf(time, event.tsSeconds);

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-md)] border bg-surface transition-colors ${PHASE_RING[phase]} ${phase === "pending" ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onSeek}
        disabled={!seekable}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-overlay disabled:cursor-default"
      >
        <span className="font-mono text-[11px] tabular-nums text-faint">
          {event.tsSeconds.toFixed(2)}s
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {event.class}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-subtle">
          {event.confidence.toFixed(2)}
        </span>
      </button>

      <p className="px-3 pb-2 text-[12px] leading-tight">
        {phase === "pending" && <span className="text-faint">Queued</span>}
        {phase === "detecting" && (
          <span className="inline-flex items-center gap-1.5 text-[var(--pastel-sky-strong)] motion-safe:animate-pulse">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--pastel-sky-strong)]"
              aria-hidden
            />
            Generating report…
          </span>
        )}
        {phase === "reported" && (
          <span className="inline-flex items-center gap-1.5 text-[var(--pastel-mint-strong)]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--pastel-mint-strong)]"
              aria-hidden
            />
            {event.report ? "Report created" : "No report — cluster reviewed"}
          </span>
        )}
      </p>

      {event.report && phase !== "pending" && (
        <details className="border-t border-hairline">
          <summary
            className={`${EYEBROW} cursor-pointer select-none px-3 py-2 transition-colors hover:text-subtle`}
          >
            Report
          </summary>
          <div className="flex flex-col gap-2 border-t border-hairline px-3 py-2">
            {(event.frameUrl ?? event.report.imageUrl) && (
              // biome-ignore lint/performance/noImgElement: signed one-off URLs
              <img
                src={event.frameUrl ?? event.report.imageUrl ?? ""}
                alt={`Evidence frame for ${event.class}`}
                className="h-24 w-full rounded-[var(--radius-md)] border border-hairline object-cover"
              />
            )}
            <ReportInline report={event.report} clampDescription={false} />
          </div>
        </details>
      )}
    </div>
  );
}

/** The recent-clips log — same five columns, now a clip picker. */
export function ClipList() {
  const { clips, selectedId, select } = useStudio();
  const needsAttention = clips.some(
    (c) => c.status === "failed" || c.status === "processing",
  );

  return (
    <details
      open={needsAttention || undefined}
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
                  <td className="px-3 py-2">{clip.status}</td>
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

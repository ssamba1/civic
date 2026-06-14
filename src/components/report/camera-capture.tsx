"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
}

const CameraIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
    />
  </svg>
);

const ImageIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
    />
  </svg>
);

const FlipIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
    />
  </svg>
);

const BoltIcon = ({
  className,
  slash,
}: {
  className?: string;
  slash?: boolean;
}) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 3.75l16.5 16.5M3.98 8.223A10.477 10.477 0 003.75 12"
      style={{ display: slash ? undefined : "none" }}
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6.75L13.5 3v6.75h6.75L10.5 21v-6.75H3.75z"
      transform="translate(0 0)"
    />
  </svg>
);

const GridIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 8.25h18M3 15.75h18M8.25 3v18M15.75 3v18"
    />
  </svg>
);

// Subset of MediaTrackCapabilities that browsers expose but TS lib.dom omits.
type ExtraCaps = {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};

// How long to wait for the live viewfinder to produce a frame before giving up
// and dropping to the native camera input. iOS Safari can leave getUserMedia in
// a started-but-never-ready state (autoplay race); without this the user stares
// at a spinner forever.
const VIEWFINDER_READY_TIMEOUT_MS = 4000;

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // `decided === false` shows a neutral spinner (also the SSR tree) until the
  // client picks a strategy — no hydration mismatch.
  //   useNative  → native camera input (no getUserMedia available, e.g. some
  //                in-app webviews)
  //   camFailed  → tried the live viewfinder, it errored or never produced a
  //                frame → fall back to the native input
  // Otherwise we open the live in-page viewfinder immediately on mount.
  const [decided, setDecided] = useState(false);
  const [useNative, setUseNative] = useState(false);
  const [camFailed, setCamFailed] = useState(false);
  // Incremented by "Try Again" to re-trigger the camera effect without
  // needing to call startCamera() imperatively after state resets.
  const [retryCount, setRetryCount] = useState(0);

  // Viewfinder controls
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [grid, setGrid] = useState(false);
  const [flash, setFlash] = useState(false); // brief white shutter flash
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);

  const markReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Live stream may still be running if the user picked from the viewfinder.
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
      onCapture(file);
    },
    [onCapture],
  );

  // capture="environment" → native camera; no capture attr → photo library.
  const openCameraPicker = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);
  const openLibraryPicker = useCallback(() => {
    libraryInputRef.current?.click();
  }, []);

  // Decide strategy once, on the client. Only force the native input when the
  // browser can't do getUserMedia at all — everything else attempts the live
  // viewfinder for the seamless "camera opens instantly" flow, with a timeout
  // fallback (below) covering iOS stalls and webview blocks.
  useEffect(() => {
    const noGetUserMedia =
      typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia;
    setUseNative(noGetUserMedia);
    setDecided(true);
  }, []);

  // Open the live viewfinder on mount and whenever the camera (facingMode)
  // changes. A timeout drops to the native input if no frame arrives.
  useEffect(() => {
    if (!decided || useNative || camFailed) return;
    readyRef.current = false;
    setReady(false);

    // cancelled flag: if the effect cleans up while getUserMedia is still
    // awaiting (StrictMode double-mount / rapid facingMode flip), the resolved
    // stream must be stopped immediately — it won't be in streamRef yet.
    let cancelled = false;

    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          // Effect already cleaned up while the promise was in-flight — stop
          // the stream that arrived too late so the camera indicator goes dark.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Release any prior stream before adopting this one.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ??
          {}) as MediaTrackCapabilities & ExtraCaps;
        setTorchSupported(Boolean(caps.torch));
        if (caps.zoom && typeof caps.zoom.max === "number") {
          setZoomCaps({
            min: caps.zoom.min ?? 1,
            max: caps.zoom.max,
            step: caps.zoom.step ?? 0.1,
          });
          setZoom(caps.zoom.min ?? 1);
        } else {
          setZoomCaps(null);
        }

        const video = videoRef.current;
        if (video) {
          video.setAttribute("webkit-playsinline", "true");
          video.onloadedmetadata = markReady;
          video.oncanplay = markReady;
          video.onplaying = markReady;
          video.srcObject = stream;
          video.play().catch(() => {
            /* canplay/metadata still flips ready */
          });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError(
            "Camera access denied. Allow camera permissions and reload, or upload a photo instead.",
          );
        } else if (
          err instanceof DOMException &&
          err.name === "NotFoundError"
        ) {
          setError("No camera found on this device.");
        } else {
          setCamFailed(true);
        }
      }
    };

    run();

    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setCamFailed(true);
      }
    }, VIEWFINDER_READY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [decided, useNative, camFailed, facingMode, markReady, retryCount]);

  // Apply torch on/off without restarting the stream.
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      /* device rejected torch; leave state unchanged */
    }
  }, [torchOn]);

  // Apply optical/digital zoom live.
  const applyZoom = useCallback((value: number) => {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track
      .applyConstraints({
        advanced: [{ zoom: value }],
      } as unknown as MediaTrackConstraints)
      .catch(() => {
        /* ignore unsupported */
      });
  }, []);

  const flipCamera = useCallback(() => {
    setTorchOn(false); // torch is rear-only; reset on flip
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Tactile feedback: brief white flash + haptic tick.
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(30);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `report-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        // Stop camera after capture
        streamRef.current?.getTracks().forEach((t) => {
          t.stop();
        });
        onCapture(file);
      },
      "image/jpeg",
      0.85,
    );
  }, [onCapture]);

  const hiddenFileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );

  // ── Neutral first paint (also the SSR tree) until the client decides ──
  if (!decided) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        {hiddenFileInputs}
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // ── Fallback: no getUserMedia, or the live viewfinder failed/stalled ──
  if (useNative || camFailed) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black px-6 text-center gap-6">
        {hiddenFileInputs}

        <div className="flex flex-col items-center gap-3">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/15 bg-white/[0.06]">
            <CameraIcon className="w-9 h-9 text-white" />
          </span>
          <div>
            <p className="text-white text-lg font-semibold">Report an issue</p>
            <p className="text-zinc-400 text-sm mt-1">
              Take a photo of the problem to get started.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={openCameraPicker}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 min-h-[56px] text-base font-semibold text-white active:scale-95 active:bg-blue-700 transition-transform"
          >
            <CameraIcon className="w-5 h-5" />
            Take a photo
          </button>
          <button
            type="button"
            onClick={openLibraryPicker}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-600 px-6 py-3 min-h-[56px] text-base font-semibold text-white active:scale-95 active:bg-zinc-800 transition-transform"
          >
            <ImageIcon className="w-5 h-5" />
            Upload from library
          </button>
        </div>
      </div>
    );
  }

  // ── Camera permission denied / not found: clear message + recovery paths ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black px-6 text-center gap-4">
        {hiddenFileInputs}
        <svg
          className="w-16 h-16 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        </svg>
        <p className="text-white text-lg font-medium">{error}</p>
        <button
          type="button"
          onClick={openCameraPicker}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          <CameraIcon className="w-5 h-5" />
          Take a photo instead
        </button>
        <button
          type="button"
          onClick={openLibraryPicker}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          <ImageIcon className="w-5 h-5" />
          Upload from library
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setReady(false);
            readyRef.current = false;
            // Increment retryCount to re-trigger the camera effect.
            setRetryCount((c) => c + 1);
          }}
          className="rounded-full border border-zinc-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Discrete zoom stops within the device's supported range (iOS-style pills).
  const zoomLevels = zoomCaps
    ? [1, 2, 3, 5].filter((z) => z >= zoomCaps.min && z <= zoomCaps.max)
    : [];
  // Guarantee at least the min + a couple of stops so the pills aren't empty
  // when the device reports an unusual range.
  if (zoomCaps && zoomLevels.length < 2) {
    zoomLevels.length = 0;
    zoomLevels.push(
      zoomCaps.min,
      Number(((zoomCaps.min + zoomCaps.max) / 2).toFixed(1)),
      zoomCaps.max,
    );
  }
  const activeZoom = zoomLevels.reduce(
    (best, z) => (Math.abs(z - zoom) < Math.abs(best - zoom) ? z : best),
    zoomLevels[0] ?? 1,
  );

  // ── Live in-page viewfinder (mobile + desktop): opens on mount ──
  return (
    <div className="relative flex flex-col items-center justify-end h-full bg-black overflow-hidden">
      {hiddenFileInputs}

      {/* Live viewfinder — front camera is mirrored to match user expectation.
          Decorative: capture happens via the shutter button, so the video is
          non-interactive (taps must never toggle the native play/pause overlay)
          and all media controls are suppressed. */}
      <video
        ref={videoRef}
        data-viewfinder
        autoPlay
        playsInline
        muted
        controls={false}
        disablePictureInPicture
        tabIndex={-1}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        className={`pointer-events-none absolute inset-0 w-full h-full object-cover ${
          facingMode === "user" ? "-scale-x-100" : ""
        }`}
      />

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Rule-of-thirds grid */}
      {ready && grid && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        </div>
      )}

      {/* Subtle corner-bracket framing (no full box — cleaner viewfinder look) */}
      {ready && !grid && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative h-72 w-72 max-h-[78vw] max-w-[78vw]">
            <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-white/50" />
            <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-white/50" />
            <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-xl border-b-2 border-l-2 border-white/50" />
            <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-xl border-b-2 border-r-2 border-white/50" />
          </div>
        </div>
      )}

      {/* Shutter flash — scoped keyframe (globals.css is owned elsewhere).
          Reduced-motion: a brief static flash still reads as capture feedback. */}
      {flash && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-white report-shutter-flash" />
      )}
      <style>{`
        @keyframes report-shutter-flash-kf {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .report-shutter-flash { opacity: 0; }
        @keyframes report-fade-in-kf {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .report-shutter-flash {
            animation: report-shutter-flash-kf 180ms ease-out forwards;
          }
          .report-fade-in {
            animation: report-fade-in-kf 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        }
      `}</style>

      {/* Top-right tool cluster: torch (if supported) + grid toggle */}
      {ready && (
        <div className="report-fade-in absolute right-4 top-4 z-20 flex flex-col gap-3 pt-safe">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
              aria-pressed={torchOn}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors active:scale-90 ${
                torchOn
                  ? "bg-yellow-400 text-black"
                  : "border border-white/30 bg-black/30 text-white"
              }`}
            >
              <BoltIcon className="h-5 w-5" slash={!torchOn} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setGrid((g) => !g)}
            aria-label={grid ? "Hide grid" : "Show grid"}
            aria-pressed={grid}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors active:scale-90 ${
              grid
                ? "bg-white text-black"
                : "border border-white/30 bg-black/30 text-white"
            }`}
          >
            <GridIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Zoom pills (only where the track reports zoom support) */}
      {ready && zoomLevels.length > 1 && (
        <div className="report-fade-in absolute inset-x-0 bottom-44 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/40 p-1.5 backdrop-blur-sm">
            {zoomLevels.map((z) => {
              const active = z === activeZoom;
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => applyZoom(z)}
                  aria-label={`Zoom ${z}x`}
                  aria-pressed={active}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[13px] font-semibold tabular-nums transition-colors active:scale-90 ${
                    active
                      ? "bg-white text-black"
                      : "text-white/80 active:text-white"
                  }`}
                >
                  {active ? `${z}×` : `${z}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls — shutter centered, upload left, flip right. pb-safe clears
          the home indicator. */}
      <div className="absolute inset-x-0 bottom-0 z-20 pb-safe">
        <div className="relative flex items-center justify-center pb-10 pt-6">
          <button
            type="button"
            onClick={openLibraryPicker}
            aria-label="Upload from library"
            className="absolute left-8 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-sm active:scale-90 transition-transform"
          >
            <ImageIcon className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            aria-label="Take photo"
            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm active:scale-90 transition-transform disabled:opacity-40"
          >
            <span className="block w-14 h-14 mx-auto rounded-full bg-white" />
          </button>

          <button
            type="button"
            onClick={flipCamera}
            aria-label="Switch camera"
            className="absolute right-8 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-sm active:scale-90 transition-transform"
          >
            <FlipIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

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

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Capture strategy is decided in an effect (never during render) so the
  // server + first client render produce the same tree — no hydration mismatch.
  //   useNative  → native camera input (mobile/touch + the live-stream fallback)
  //   !useNative → live getUserMedia viewfinder (desktop webcams)
  // `decided === false` shows a brief neutral spinner until the effect resolves,
  // which also prevents getUserMedia from ever starting on a touch device.
  const [decided, setDecided] = useState(false);
  const [useNative, setUseNative] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Live stream may still be running if user picked from viewfinder.
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

  // Decide capture strategy once, on the client. Touch devices (and any browser
  // without a working getUserMedia) use the native camera input — the live
  // viewfinder path is unreliable on iOS Safari (autoplay stalls, ready races).
  useEffect(() => {
    const coarsePointer =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 768px)").matches;
    const noGetUserMedia =
      typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia;
    setUseNative(coarsePointer || noGetUserMedia);
    setDecided(true);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        // Attach readiness handlers BEFORE srcObject so a fast-firing
        // loadedmetadata/canplay isn't missed, then nudge playback — autoPlay
        // alone can stall on some browsers.
        const markReady = () => setReady(true);
        video.onloadedmetadata = markReady;
        video.oncanplay = markReady;
        video.srcObject = stream;
        video.play().catch(() => {
          /* autoplay may reject; canplay/metadata still flips ready */
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Camera access denied. Please allow camera permissions and reload.",
        );
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not access camera. Please try again.");
      }
    }
  }, []);

  // Start the live viewfinder only on the desktop path.
  useEffect(() => {
    if (!decided || useNative) return;
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
    };
  }, [decided, useNative, startCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
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

  // ── Mobile / touch: native camera capture (reliable on iOS Safari) ──
  if (useNative) {
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
            className="inline-flex items-center justify-center rounded-full border border-zinc-600 px-6 py-3 min-h-[56px] text-base font-semibold text-white active:scale-95 active:bg-zinc-800 transition-transform"
          >
            Upload from library
          </button>
        </div>
      </div>
    );
  }

  // ── Desktop error state: offer the native fallbacks ──
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
          className="mt-2 rounded-full bg-blue-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          Take a photo instead
        </button>
        <button
          type="button"
          onClick={openLibraryPicker}
          className="rounded-full border border-zinc-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          Upload from library
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            startCamera();
          }}
          className="rounded-full border border-zinc-600 px-6 py-3 min-h-[44px] text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ── Desktop: live getUserMedia viewfinder ──
  return (
    <div className="relative flex flex-col items-center justify-end h-full bg-black">
      {hiddenFileInputs}

      {/* Live viewfinder */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Crosshair overlay */}
      {ready && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white/30 rounded-2xl" />
        </div>
      )}

      {/* Capture button — pb-safe wrapper clears home indicator */}
      <div className="relative z-10 pb-safe">
        <div className="pb-10 pt-6 flex flex-col items-center gap-4">
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
            onClick={openLibraryPicker}
            className="text-sm font-medium text-white/80 underline-offset-4 underline min-h-[44px] px-4 active:text-white transition-colors"
          >
            Upload from library
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

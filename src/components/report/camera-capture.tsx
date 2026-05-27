"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera permissions and reload.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Could not access camera. Please try again.");
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(file);
      },
      "image/jpeg",
      0.85
    );
  }, [onCapture]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black px-6 text-center gap-4">
        <svg
          className="w-16 h-16 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
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
          onClick={() => {
            setError(null);
            startCamera();
          }}
          className="mt-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black active:scale-95 transition-transform"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-end h-full bg-black">
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

      {/* Capture button */}
      <div className="relative z-10 pb-10 pt-6">
        <button
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm active:scale-90 transition-transform disabled:opacity-40"
        >
          <span className="block w-14 h-14 mx-auto rounded-full bg-white" />
        </button>
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

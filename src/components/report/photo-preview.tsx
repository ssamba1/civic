"use client";

import { useState, useMemo, useEffect } from "react";

type GpsStatus = "acquiring" | "found" | "manual";

interface PhotoPreviewProps {
  photo: File;
  gpsStatus: GpsStatus;
  onRetake: () => void;
  onSubmit: (description: string | null) => void;
  submitting: boolean;
}

export default function PhotoPreview({
  photo,
  gpsStatus,
  onRetake,
  onSubmit,
  submitting,
}: PhotoPreviewProps) {
  const [showDescription, setShowDescription] = useState(false);
  const [description, setDescription] = useState("");

  const previewUrl = useMemo(() => URL.createObjectURL(photo), [photo]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const gpsIndicator: Record<GpsStatus, { label: string; color: string }> = {
    acquiring: { label: "Getting location...", color: "bg-yellow-400" },
    found: { label: "Location attached", color: "bg-green-500" },
    manual: { label: "Enter address below", color: "bg-orange-400" },
  };

  const gps = gpsIndicator[gpsStatus];

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Photo preview */}
      <div className="relative flex-1 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo preview"
          className="w-full h-full object-cover"
        />

        {/* GPS status badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5">
          <span className={`w-2 h-2 rounded-full ${gps.color} ${gpsStatus === "acquiring" ? "animate-pulse" : ""}`} />
          <span className="text-xs text-white font-medium">{gps.label}</span>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 bg-zinc-950 px-4 pt-4 pb-8 space-y-3">
        {/* Optional description */}
        {!showDescription ? (
          <button
            type="button"
            onClick={() => setShowDescription(true)}
            className="w-full text-left text-sm text-zinc-400 py-2 px-3 rounded-lg border border-zinc-800 active:bg-zinc-800 transition-colors"
          >
            + Add description (optional)
          </button>
        ) : (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue..."
            rows={3}
            maxLength={500}
            autoFocus
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
          />
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onRetake}
            disabled={submitting}
            className="flex-1 rounded-full border border-zinc-700 py-3.5 text-sm font-semibold text-white active:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={() => onSubmit(description.trim() || null)}
            disabled={submitting}
            className="flex-1 rounded-full bg-blue-600 py-3.5 text-sm font-semibold text-white active:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

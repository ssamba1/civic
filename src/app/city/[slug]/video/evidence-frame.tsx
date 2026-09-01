"use client";

/**
 * Evidence frame viewer.
 *
 * A detection's stored frame is the WHOLE video frame, not a crop. The crop
 * would throw away the context an operator needs (which lane, how far from the
 * curb, what else is in shot). So the frame renders whole and the detector's
 * box is drawn back on top of it from `damage_detections.bbox`, which is
 * normalized 0..1 top-left in the same convention the live overlay uses
 * (src/lib/video/detector.ts computes x = cx - w/2).
 *
 * Percentage positioning is deliberate: the frame is responsive and the box
 * has to track it at any width without measuring the image.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { detectionHue } from "./detection-colors";

export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf?: number;
}

/**
 * Every stroke of the drawn box resolves through one custom property, so a
 * caller that knows the detection's class can recolor the whole box (border,
 * wash, label) by setting `--detect-hue` on any ancestor. Unset, it stays the
 * blush the box has always been.
 */
const BOX_HUE = "var(--detect-hue, var(--pastel-blush-strong))";

/** Normalized 0..1, so a malformed row can't blow the box off the frame. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function EvidenceFrame({
  src,
  box,
  label,
  alt,
  className,
}: {
  src: string;
  box?: DetectionBox | null;
  /** e.g. "pothole · 0.87", drawn on the box's leader when there is room. */
  label?: string;
  alt: string;
  className?: string;
}) {
  const left = box ? clamp01(box.x) * 100 : 0;
  const top = box ? clamp01(box.y) * 100 : 0;
  const width = box ? clamp01(box.w) * 100 : 0;
  const height = box ? clamp01(box.h) * 100 : 0;

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {/* biome-ignore lint/performance/noImgElement: signed one-off bucket URLs aren't in next/image remotePatterns */}
      <img src={src} alt={alt} className="block h-full w-full object-cover" />
      {box && (
        <div
          aria-hidden
          data-testid="evidence-box"
          className="pointer-events-none absolute rounded-[2px] border"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
            // The box wears its detection's CLASS hue, so it matches the card
            // that owns it. `--detect-hue` is set by whoever knows the class
            // (EvidenceFrameButton below); callers that don't. E.g. the work
            // order detail pane. Keep the original blush.
            borderColor: BOX_HUE,
            backgroundColor: `color-mix(in srgb, ${BOX_HUE} 12%, transparent)`,
            boxShadow: "0 0 0 1px color-mix(in srgb, #000 35%, transparent)",
          }}
        >
          {label && (
            <span
              className="absolute -top-[1.15rem] left-0 whitespace-nowrap rounded-t-[3px] px-1 font-mono text-[10px] leading-[1.4]"
              style={{
                color: BOX_HUE,
                backgroundColor: `color-mix(in srgb, ${BOX_HUE} 18%, transparent)`,
              }}
            >
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Thumbnail that opens the full frame. The thumbnail is `object-cover` at a
 * fixed aspect, so the box is drawn only in the modal where the frame is shown
 * whole and the coordinates actually line up.
 */
export function EvidenceFrameButton({
  src,
  box,
  label,
  alt,
  title,
  subtitle,
  className,
}: {
  src: string;
  box?: DetectionBox | null;
  label?: string;
  alt: string;
  /** Modal heading, the detection's class, usually. */
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // `title` is the detection's class at every call site (the modal heading is
  // the class), and the Modal portals out of this subtree, so the hue has to
  // be resolved here and planted inside the portal, not inherited.
  const hue = detectionHue(title).strong;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open evidence frame for ${title}`}
        className={`group relative block overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${className ?? ""}`}
      >
        {/* biome-ignore lint/performance/noImgElement: signed one-off bucket URLs aren't in next/image remotePatterns */}
        <img
          src={src}
          alt={alt}
          className="block h-full w-full object-cover transition-opacity group-hover:opacity-85"
        />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={subtitle}
        className="max-w-3xl"
      >
        <div style={{ "--detect-hue": hue } as React.CSSProperties}>
          <EvidenceFrame
            src={src}
            box={box}
            label={label}
            alt={alt}
            className="w-full rounded-[var(--radius-md)] border border-hairline"
          />
        </div>
        <p className="mt-2 text-[12px] text-faint">
          Full captured frame; the box is the detector&apos;s own bounding box
          for this detection.
        </p>
      </Modal>
    </>
  );
}

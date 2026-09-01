"use client";

import { useEffect, useRef, useState } from "react";

import type { DetectionExport, Promotion } from "@/lib/camera-demo/promotions";
import { contractFor } from "@/lib/camera-demo/vendors";

/**
 * Detail dialog for one promoted defect: evidence screenshot (frame seeked
 * from the demo clip, everything dimmed except the relevant detection),
 * mock contract + warranty, packet checklist, and a demo send button.
 * Nothing leaves the browser. "send" flips local state only.
 */

const VIDEO_SRC = "/camera-demo/bus-feed.mp4";

const CHECKLIST = [
  "Evidence photo attached (blurred)",
  "GPS + timestamp recorded",
  "Repeat observations confirmed",
  "Severity classified, work order drafted",
  "Contract + warranty window verified",
  "Packet snapshot frozen (immutable)",
];

function drawEvidence(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  data: DetectionExport,
  p: Promotion,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.drawImage(video, 0, 0, W, H);
  // Dim everything…
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);
  // …then re-draw only the relevant detection at full brightness.
  const b = p.bestBox;
  const sx = b.x * data.width;
  const sy = b.y * data.height;
  const sw = b.w * data.width;
  const sh = b.h * data.height;
  const dx = b.x * W;
  const dy = b.y * H;
  const dw = b.w * W;
  const dh = b.h * H;
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(dx, dy, dw, dh);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  const label = `pothole · ${(b.conf * 100).toFixed(0)}% · cluster ${p.id.replace("promo-", "")}`;
  ctx.font = "12px ui-sans-serif, system-ui";
  const tw = ctx.measureText(label).width + 10;
  ctx.fillRect(dx, Math.max(dy - 18, 0), tw, 17);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, dx + 5, Math.max(dy - 5, 12));
}

export function ClaimDetail({
  promotion,
  data,
  onClose,
}: {
  promotion: Promotion;
  data: DetectionExport;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sent, setSent] = useState(false);
  const contract = contractFor(promotion);

  // Seek a detached video element to the evidence frame and paint it.
  useEffect(() => {
    const video = document.createElement("video");
    video.src = VIDEO_SRC;
    video.muted = true;
    video.preload = "auto";
    const onSeeked = () => {
      if (canvasRef.current) {
        drawEvidence(canvasRef.current, video, data, promotion);
      }
    };
    const onLoaded = () => {
      video.currentTime = promotion.frameIndex / data.fps;
    };
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.load();
    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.src = "";
    };
  }, [data, promotion]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Claim detail for cluster ${promotion.id}`}
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg border bg-card shadow-lg">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold text-sm">
              Claim draft, cluster {promotion.id.replace("promo-", "")}
            </h2>
            <p className="text-muted-foreground text-xs">
              Pothole · conf {(promotion.peakConf * 100).toFixed(0)}% ·{" "}
              {promotion.observationCount} observations ·{" "}
              {promotion.location.lat.toFixed(4)},{" "}
              {promotion.location.lng.toFixed(4)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border px-2 py-1 text-muted-foreground text-xs hover:bg-muted"
          >
            ✕
          </button>
        </header>

        <div className="grid gap-4 p-4">
          {/* Evidence. Only the relevant detection stays lit */}
          <section>
            <h3 className="mb-1 font-medium text-xs">Evidence</h3>
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              className="w-full rounded-md border bg-black"
            />
          </section>

          {/* Mock contract + warranty */}
          <section className="grid gap-1 rounded-md border p-3 text-xs">
            <h3 className="font-medium">Liability basis (mock)</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
              <dt>Contractor</dt>
              <dd className="text-foreground">{contract.vendor}</dd>
              <dt>Contract</dt>
              <dd>
                {contract.contractRef} · {contract.jobType}
              </dd>
              <dt>Completed</dt>
              <dd>{contract.completedOn}</dd>
              <dt>Warranty</dt>
              <dd>{contract.warrantyType}</dd>
              <dt>Window ends</dt>
              <dd className="text-foreground">
                {contract.windowEndsOn} ({contract.daysLeft} days left)
              </dd>
              <dt>Bond</dt>
              <dd>{contract.bondRef}</dd>
              <dt>Contract value</dt>
              <dd>{contract.contractValue}</dd>
            </dl>
          </section>

          {/* Checklist */}
          <section className="rounded-md border p-3">
            <h3 className="mb-1.5 font-medium text-xs">Packet checklist</h3>
            <ul className="grid gap-1 text-xs">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden>✓</span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <footer className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Demo. Nothing is delivered. The real queue is staff-approved
              (/admin/claims).
            </p>
            <button
              type="button"
              disabled={sent}
              onClick={() => setSent(true)}
              className="rounded-md border bg-foreground px-3 py-1.5 font-medium text-background text-xs disabled:opacity-60"
            >
              {sent ? `Sent to ${contract.vendor} ✓` : "Send to contractor"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

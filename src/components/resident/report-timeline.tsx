"use client";

import {
  CheckCircle2,
  FileText,
  ImageOff,
  type LucideIcon,
  Send,
  Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { TimelineStep } from "@/lib/resident-data";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Resident report timeline — "what happens next" vertical stepper.

   Renders the four-stage track (filed → dispatched → in_progress →
   resolved) returned by getReportTimeline. Each step shows its stage
   icon, label, and an absolute timestamp (or "Pending" when the stage
   hasn't happened yet). State styling:
     done     → filled accent (#0a84ff), resolved step green (#30d158)
     current  → highlighted ring around the node
     future   → muted
   A connector line joins consecutive nodes; it lights up to accent
   between two done steps so the resident reads progress at a glance.

   Tone maps + timestamp formatting mirror the sibling resident/ops
   components (those helpers are module-private and not exported).
   ================================================================== */

const ACCENT = "#0a84ff";
const RESOLVED = "#30d158";

const STAGE_ICON: Record<TimelineStep["stage"], LucideIcon> = {
  filed: FileText,
  dispatched: Send,
  in_progress: Wrench,
  resolved: CheckCircle2,
};

// Mirrors absoluteDate in report-detail.tsx.
function absoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReportTimeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    /* Comfortable vertical stepper — node is 44px on mobile (min-tap),
       scales down to 32px (h-8 w-8) on sm+ where precision pointing
       is available. Gap between node and label is wider on mobile too. */
    <ol className="relative flex flex-col">
      {steps.map((step, i) => {
        const Icon = STAGE_ICON[step.stage];
        const isLast = i === steps.length - 1;
        const isResolved = step.stage === "resolved";
        const nodeColor = isResolved ? RESOLVED : ACCENT;

        // Connector lights up only when this step AND the next are done,
        // so the filled track stops at the latest completed stage.
        const next = steps[i + 1];
        const connectorLit = step.done && next?.done;
        const connectorColor = next?.stage === "resolved" ? RESOLVED : ACCENT;

        return (
          /* pb-7 on mobile gives each step more breathing room on the
             small screen; pb-6 on sm+ preserves the original compact look. */
          <li
            key={step.stage}
            style={{ animationDelay: `${i * 80}ms` }}
            className="relative flex gap-3 pb-7 last:pb-0 animate-in fade-in slide-in-from-left-2 fill-mode-both duration-300 motion-reduce:animate-none sm:gap-4 sm:pb-6"
          >
            {/* Connector line behind the node.
                Offset accounts for the larger mobile node (44px → left-[21px])
                and the smaller sm+ node (32px → left-4 = 16px center). */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[21px] top-[52px] bottom-0 w-px sm:left-4 sm:top-8"
                style={{
                  backgroundColor: connectorLit
                    ? connectorColor
                    : "rgba(255,255,255,0.10)",
                }}
              />
            )}

            {/* Node — 44×44 on mobile for comfortable touch; 32×32 on sm+ */}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-colors sm:h-8 sm:w-8",
                step.current && "ring-2 ring-offset-2 ring-offset-[#1c1c1e]",
              )}
              style={{
                backgroundColor: step.done
                  ? nodeColor
                  : "rgba(255,255,255,0.04)",
                borderColor: step.done ? nodeColor : "rgba(255,255,255,0.10)",
                ...(step.current
                  ? ({ "--tw-ring-color": nodeColor } as CSSProperties)
                  : {}),
              }}
            >
              <Icon
                className={cn(
                  "h-5 w-5 sm:h-4 sm:w-4",
                  step.done ? "text-black/80" : "text-faint",
                )}
                strokeWidth={2}
              />
            </span>

            {/* Label + timestamp + optional note */}
            <div className="flex min-w-0 flex-col gap-0.5 pt-2.5 sm:pt-1">
              <span
                className={cn(
                  "text-[14px] font-medium leading-tight sm:text-[14px]",
                  step.done || step.current ? "text-foreground" : "text-faint",
                )}
              >
                {step.label}
              </span>
              <span
                className="text-[13px] leading-tight tabular-nums sm:text-[12px]"
                style={{
                  color: step.at ? "rgb(161 161 170)" : "rgb(113 113 122)",
                }}
              >
                {step.at ? absoluteDate(step.at) : "Pending"}
              </span>
              {step.note && (
                <span className="mt-1.5 text-[13px] leading-relaxed text-subtle sm:mt-1 sm:text-[12px]">
                  {step.note}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------
   Report photo with graceful fallback. Mirrors ReportImage in
   report-detail.tsx — some sources (CSP-blocked hosts, dead links)
   won't load, so we swap in a neutral placeholder rather than leave a
   16:9 void. Lives here because the detail page is a Server Component
   and onError needs a client boundary; key by report id at the call
   site so the error state resets per report.
   ------------------------------------------------------------------ */

export function ReportPhoto({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-overlay text-faint">
        <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        <span className="text-[12px]">Image unavailable</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    // biome-ignore lint/performance/noImgElement: dynamic external photo URL with runtime onError fallback, not optimizable by next/image
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="aspect-[16/9] w-full object-cover"
    />
  );
}

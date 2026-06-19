import type { ReportStatus } from "@/lib/types";

/* ==================================================================
   Status presentation — single source of truth.

   Replaces the STATUS_LABEL / STATUS_TONE maps that were duplicated
   (and had drifted) across recent-reports, reports-explorer,
   report-detail, delegation-panel, and report-map.

   Two layers:
   - STATUS_LABEL — canonical status → human label.
   - STATUS_TONE  — status → semantic tone, the input to the chip
     helpers below.

   The chip TEXT uses the theme-aware --status-*-fg tokens (defined in
   globals.css, flipped per light/dark) so the small label clears WCAG
   AA on the near-white light surface, while the pill FILL keeps the
   bright system hue. Class strings are FULL LITERALS — Tailwind's
   scanner only emits utilities it sees verbatim, so never build these
   by interpolating the tone into the class name.
   ================================================================== */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

// in_progress shares the `info` tone (its cyan fill has no separate text
// token); the label keeps it distinct from `dispatched`.
export const STATUS_TONE: Record<ReportStatus, StatusTone> = {
  open: "warning",
  dispatched: "info",
  in_progress: "info",
  closed: "success",
  merged: "neutral",
  rejected: "danger",
};

// Theme-aware text color per tone. Full literal strings (see note above).
const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-[var(--status-success-fg)]",
  warning: "text-[var(--status-warning-fg)]",
  danger: "text-[var(--status-danger-fg)]",
  info: "text-[var(--status-info-fg)]",
  neutral: "text-[var(--status-neutral-fg)]",
};

// Bright pill fill per tone. Hex /10 wash is theme-agnostic and proven; the
// neutral tone uses the semantic overlay so it stays visible in light mode
// (the old `bg-white/[0.06]` was invisible on a white surface).
const TONE_BG: Record<StatusTone, string> = {
  success: "bg-[#30d158]/10",
  warning: "bg-[#ff9f0a]/10",
  danger: "bg-[#ff453a]/10",
  info: "bg-[#0a84ff]/10",
  neutral: "bg-overlay-strong",
};

/** Text color class for a tone (no background). */
export function toneTextClass(tone: StatusTone): string {
  return TONE_TEXT[tone];
}

/** Combined chip class (text + fill) for a tone. */
export function toneChipClass(tone: StatusTone): string {
  return `${TONE_TEXT[tone]} ${TONE_BG[tone]}`;
}

/** Combined chip class straight from a status. */
export function statusChipClass(status: ReportStatus): string {
  return toneChipClass(STATUS_TONE[status]);
}

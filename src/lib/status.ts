import type { ReportStatus } from "@/lib/types";

/* ==================================================================
   Status presentation, single source of truth.

   Replaces the STATUS_LABEL / STATUS_TONE maps that were duplicated
   (and had drifted) across recent-reports, reports-explorer,
   report-detail, delegation-panel, and report-map.

   Two layers:
   - STATUS_LABEL, canonical status → human label.
   - STATUS_TONE, status → semantic tone, the input to the chip
     helpers below.

   The chip TEXT uses the theme-aware --status-*-fg tokens (defined in
   globals.css, flipped per light/dark) so the small label clears WCAG
   AA on the near-white light surface, while the pill FILL keeps the
   bright system hue. Class strings are FULL LITERALS. Tailwind's
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

// Outline + dot chip (matches ui/badge.tsx): quiet overlay fill + hairline
// border in both themes, with a 6px `before:` pseudo-element dot carrying the
// hue. The pseudo dot means the 19 existing <span> consumers convert without
// markup changes. Label text stays in the AA-tuned --status-*-fg tokens; the
// dot uses the muted status FILL tokens (info = the slate-blue shared with
// badge.tsx, a state signal, not Apple blue).
const TONE_CHIP_BASE =
  "inline-flex items-center gap-1.5 border border-hairline bg-overlay before:size-1.5 before:shrink-0 before:rounded-full before:content-['']";

const TONE_DOT: Record<StatusTone, string> = {
  success: "before:bg-[var(--color-success)]",
  warning: "before:bg-[var(--color-warning)]",
  danger: "before:bg-[var(--color-danger)]",
  info: "before:bg-[#5b6b8c]",
  neutral: "before:bg-faint",
};

/** Text color class for a tone (no background). */
export function toneTextClass(tone: StatusTone): string {
  return TONE_TEXT[tone];
}

/** Combined chip class (outline + dot + text) for a tone. */
export function toneChipClass(tone: StatusTone): string {
  return `${TONE_CHIP_BASE} ${TONE_DOT[tone]} ${TONE_TEXT[tone]}`;
}

/** Combined chip class straight from a status. */
export function statusChipClass(status: ReportStatus): string {
  return toneChipClass(STATUS_TONE[status]);
}

import { stackedBarLayers } from "@/lib/utils/stacked-bar";

/* ==================================================================
   Status mini-bar — a thin stacked proportion bar for a status mix,
   plus the shared status→color map and day formatter. Used by team
   cards and crew cards alike.
   ================================================================== */

// Mirrors STATUS_PALETTE in workload-bars.tsx (kept byte-identical).
// Deliberately diverges from lib/status.ts's STATUS_TONE: chips encode status
// via TEXT (a11y-tuned per-theme fg tokens), this bar encodes status via FILL
// AREA — different constraint, so a separate local map. Pastel efferd ramp:
// open = butter-strong (warning-ish, the one actionable state, pops);
// dispatched/in_progress share the sky (info) hue — dispatched is a
// color-mix-softened sky, in_progress full sky-strong, so their relative
// weight ordering holds in both themes without raw hex. Segments overpaint
// each other (absolute right-0 layers), and the raw --pastel-* soft tokens
// are alpha in dark mode, so every fill must stay opaque: color-mix against
// --surface stands in for "soft". closed = softened mint (success-ish) that
// still recedes; merged stays neutral gray; rejected = blush-strong.
export const STATUS_COLORS = {
  open: "var(--pastel-butter-strong)",
  dispatched:
    "color-mix(in srgb, var(--pastel-sky-strong) 45%, var(--surface))",
  in_progress: "var(--pastel-sky-strong)",
  closed: "color-mix(in srgb, var(--pastel-mint-strong) 40%, var(--surface))",
  merged: "var(--color-muted)",
  rejected: "var(--pastel-blush-strong)",
} as const;

interface StatusMiniBarProps {
  segments: { value: number; color: string; label: string }[];
}

export function StatusMiniBar({ segments }: StatusMiniBarProps) {
  const layers = stackedBarLayers(segments);
  if (layers.length === 0) {
    return <div className="h-1.5 w-full rounded-full bg-overlay" />;
  }
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.value} ${s.label}`)
        .join(", ")}
    >
      {layers.map((l) => (
        <span
          key={`${l.color}-${l.startPct}`}
          className="absolute inset-y-0 right-0"
          style={{ left: `${l.startPct}%`, background: l.color }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function formatDays(d: number): string {
  if (d < 1) return "<1d";
  if (d < 30) return `${Math.round(d)}d`;
  const months = Math.round(d / 30);
  return `${months}mo`;
}

import { stackedBarLayers } from "@/lib/utils/stacked-bar";

/* ==================================================================
   Status mini-bar — a thin stacked proportion bar for a status mix,
   plus the shared status→color map and day formatter. Used by team
   cards and crew cards alike.
   ================================================================== */

// Mirrors STATUS_PALETTE in workload-bars.tsx (kept byte-identical). Deliberately
// diverges from lib/status.ts's STATUS_TONE: chips encode status via TEXT
// (a11y-tuned per-theme fg tokens), this bar encodes status via FILL AREA —
// different constraint, so a separate local map. Enterprise-gray direction:
// amber is the only hue (open = the one actionable state); everything else is
// a gray ramp. dispatched/in_progress are flat, non-theme-adaptive hex rather
// than var(--subtle)/var(--faint) — those two tokens invert their relative
// lightness between light and dark (tuned for text contrast against opposite
// backgrounds, not for fill-vs-fill ordering), so a live var() would render
// in_progress *darker* than dispatched in dark mode. Flat hex keeps
// in_progress reliably lighter than dispatched in both themes. closed uses
// --elevated so resolved work recedes into the surface instead of a "success"
// color celebrating completion.
export const STATUS_COLORS = {
  open: "var(--color-warning)",
  dispatched: "#52525b",
  in_progress: "#85858c",
  closed: "var(--elevated)",
  merged: "var(--color-muted)",
  rejected: "var(--color-danger)",
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

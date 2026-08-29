/* ==================================================================
   Canonical severity ramp — ONE source for every surface that colors a
   severity value (1 = cosmetic … 5 = emergency).

   Severity is ORDINAL and it encodes STATE, not category, so the ramp is
   built from the semantic status tokens rather than a decorative/pastel
   hue wheel: a categorical palette makes "5" read as merely *different*
   from "4" instead of *worse*, and pastel blush for "emergency" reads
   softer than peach for "major" — backwards.

   Built by color-mixing `--status-success-fg → --status-warning-fg →
   `--status-danger-fg`, with mixed midpoints for 2 and 4. Deliberately the
   `--status-*-fg` tokens, NOT the saturated `--color-success/warning/danger`
   fills — the `-fg` set is AA-tuned and flips per theme, the fills have no
   dark override and wash out on dark surfaces.

   One hue per level drives every surface of a swatch (text digit, low-alpha
   tint fill, ring, donut arc), so the same value is safe as foreground and
   as a tint.

   Mirrored (deliberately, module-private there) by
   `src/components/city/work-order-grid.tsx`; keep the values in sync.
   ================================================================== */

export type SeverityLevel = 1 | 2 | 3 | 4 | 5;

export const SEVERITY_HUE: Record<SeverityLevel, string> = {
  1: "var(--status-success-fg)",
  2: "color-mix(in srgb, var(--status-success-fg) 55%, var(--status-warning-fg))",
  3: "var(--status-warning-fg)",
  4: "color-mix(in srgb, var(--status-warning-fg) 50%, var(--status-danger-fg))",
  5: "var(--status-danger-fg)",
};

/** Ramp lookup that tolerates unvalidated numbers from the wire. */
export function severityHue(value: number): string {
  return SEVERITY_HUE[value as SeverityLevel] ?? SEVERITY_HUE[3];
}

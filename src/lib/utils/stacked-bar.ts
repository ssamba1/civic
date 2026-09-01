/**
 * Compute paint layers for a stacked proportion bar.
 *
 * Two failed approaches inform this one:
 * - N flexed child divs: each segment's fractional pixel width rounds
 *   independently, leaving sub-pixel seams where the track bleeds through.
 * - One hard-stop `linear-gradient`: Chromium rasterizes hard stops with a
 *   dithered ~1px diagonal edge, so on a short bar (especially at fractional
 *   devicePixelRatio like Windows 150% scaling) each color band appears
 *   vertically raised or sunk relative to its neighbors.
 *
 * Instead, render each part as an absolutely positioned full-height layer that
 * starts at its cumulative offset and extends to the bar's end, painted in
 * order so each later layer covers the remainder of the previous one. Every
 * visible boundary is a single element's left edge drawn over solid color,
 * no adjacent-edge rounding (no seams) and box edges rasterize as crisp
 * vertical lines (no gradient dithering).
 *
 * Returns layers in paint order (render them in order; DOM order = z-order).
 * Returns an empty array when nothing has a positive value (caller renders an
 * empty track).
 */
export function stackedBarLayers(
  parts: { value: number; color: string }[],
): { color: string; startPct: number }[] {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total <= 0) return [];

  const layers: { color: string; startPct: number }[] = [];
  let acc = 0;
  for (const part of parts) {
    if (part.value <= 0) continue;
    layers.push({ color: part.color, startPct: (acc / total) * 100 });
    acc += part.value;
  }
  return layers;
}

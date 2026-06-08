/**
 * Build a single hard-stop `linear-gradient` for a stacked proportion bar.
 *
 * Rendering a stack as N flexed child divs gives each segment a fractional
 * pixel width that the browser rounds independently, leaving sub-pixel seams
 * where the track bleeds through — which, under a `rounded-full` overflow clip,
 * reads as segments of uneven height. One gradient-filled box has no seams, no
 * flex rounding, and a uniform edge-to-edge height.
 *
 * Returns null when nothing has a positive value (caller renders an empty track).
 */
export function stackedBarGradient(
  parts: { value: number; color: string }[],
): string | null {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total <= 0) return null;

  const stops: string[] = [];
  let acc = 0;
  for (const part of parts) {
    if (part.value <= 0) continue;
    const start = (acc / total) * 100;
    acc += part.value;
    const end = (acc / total) * 100;
    // Shared boundary percentage between adjacent stops = crisp edge, no blend.
    stops.push(`${part.color} ${start}% ${end}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

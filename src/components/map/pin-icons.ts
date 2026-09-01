import { CATEGORY_META, type DashboardReport } from "@/lib/dashboard-data";
import { categoryToTeam, TEAMS, type TeamId } from "@/lib/teams";

/* ==================================================================
   Teardrop pin icons for the report map (IconLayer, deck.gl v9).

   Single source of truth for BOTH the SVG markers rendered on the GPU
   and the legend swatches in report-map.tsx. A color literal lives
   here exactly once so the map and its legend can never drift apart.

   Design mirrors the landing hero pin (components/landing/riven/
   MapPinStory.tsx): a solid teardrop with a thin (~1.2 unit) border and
   a centered glyph in the head,
   the report's CATEGORY icon (lucide path data inlined below, mapped
   via CATEGORY_META's icon names), overridden by a check on completed
   pins. The tip of the pin sits on the report location (anchorY =
   raster height), the balloon head rises above it, exactly like a
   physical map pin. Icons rasterize at 2x (48x48 raster, 24-unit
   viewBox) so they stay crisp on retina while getSize scales the
   on-screen height.
   ================================================================== */

export type MarkerColorMode = "progress" | "urgency" | "team";

// Borders. Colored pins take a white border so they read on the dark
// (matter) basemap; the white "open" pin instead takes a dark slate
// border so it stays visible on the light (voyager) basemap.
const WHITE_BORDER = "rgba(255,255,255,0.92)";
const OPEN_BORDER = "rgba(60,66,82,0.9)";

// Progress ramp: open (white) -> dispatched (blue) -> working/done (green,
// completed adds a check). Blue #3b82f6 is muted enough to read on both the
// light voyager and dark matter basemaps. in_progress and closed share green;
// the check glyph is what distinguishes "done" from "being worked".
const PROGRESS_DISPATCHED = "#3b82f6";
const PROGRESS_GREEN = "#16a34a";

// Urgency ramp: severity 1 -> 5, yellow -> red, five distinct steps tuned to
// hold contrast against both basemaps.
export const URGENCY_COLORS = [
  "#eab308",
  "#d97706",
  "#ea580c",
  "#dc2626",
  "#b91c1c",
] as const;

/* ------------------------------------------------------------------
   Icon descriptor + module-level cache
   ------------------------------------------------------------------ */

// Shape consumed by IconLayer auto-packing (a subset of deck.gl's
// UnpackedIcon). anchorX is omitted so it defaults to half-width (the
// horizontal center); anchorY = height puts the anchor on the pin's tip.
export interface PinIcon {
  url: string;
  id: string;
  width: number;
  height: number;
  anchorY: number;
}

const RASTER = 48; // 2x of the 24-unit viewBox, crisp on retina
const iconCache = new Map<string, PinIcon>();

/* ------------------------------------------------------------------
   Category glyphs, lucide path data copied verbatim from
   node_modules/lucide-react/dist/esm/icons/*.mjs (24-unit space),
   keyed by the icon-name strings CATEGORY_META already assigns per
   category (so popup, list rows, and pins share one mapping). Raw
   fragments only. Fill/stroke/caps are inherited from the wrapping
   <g> in buildPinSVG. "waves" = lucide waves-horizontal; "help-circle"
   = lucide circle-question-mark (aliases in the installed version).
   ------------------------------------------------------------------ */
const GLYPHS: Record<string, string> = {
  // pothole
  "circle-alert": `<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>`,
  // streetlight
  lightbulb: `<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>`,
  // downed_sign + faded_signage (lucide "signpost")
  "sign-post": `<path d="M12 13v8"/><path d="M12 3v3"/><path d="M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z"/>`,
  // graffiti
  "spray-can": `<path d="M3 3h.01"/><path d="M7 5h.01"/><path d="M11 7h.01"/><path d="M3 7h.01"/><path d="M7 9h.01"/><path d="M3 11h.01"/><rect width="4" height="4" x="15" y="5"/><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/><path d="m13 14 8-2"/><path d="m13 19 8-2"/>`,
  // illegal_dump
  "trash-2": `<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
  // water_leak
  droplets: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>`,
  // sidewalk_damage
  footprints: `<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>`,
  // tree_down
  "tree-pine": `<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>`,
  // debris
  construction: `<rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 6 7.7 7.7"/><path d="m8 6 8 8"/>`,
  // drainage (lucide "waves-horizontal")
  waves: `<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"/>`,
  // other + any unknown icon name (lucide "circle-question-mark")
  "help-circle": `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
};

// Check glyph, completed pins. Drawn in pin space (not the scaled-down
// lucide space) so it stays a touch bolder than the category glyphs.
const CHECK_GLYPH = `<path d="M8.4 11.7 11 14.4 16 8.9"/>`;

function buildPinSVG(fill: string, border: string, glyphId: string): string {
  // Glyph tone pairs with the fill: white glyph on colored pins, slate on
  // the white "open" pin (white-on-white would be invisible).
  const isWhite =
    fill.toLowerCase() === "#ffffff" || fill.toLowerCase() === "#fff";
  const glyphColor = isWhite ? "#3c4252" : "#ffffff";
  // Category glyphs: lucide 24-unit art scaled to 0.3 (~7.2 units ≈ 45% of
  // the 16-unit head diameter), centered on the head (12, 11.5). stroke-width
  // 2.75 pre-scale ≈ 0.83 pin units. Reads at the ~26-34px render size.
  const glyph =
    glyphId === "check"
      ? `<g fill="none" stroke="${glyphColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${CHECK_GLYPH}</g>`
      : `<g transform="translate(12 11.5) scale(0.3) translate(-12 -12)" fill="none" stroke="${glyphColor}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyphId] ?? GLYPHS["help-circle"]}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER}" height="${RASTER}" viewBox="0 0 24 24">` +
    `<path d="M20 12c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="${fill}" stroke="${border}" stroke-width="1.2"/>` +
    glyph +
    `</svg>`
  );
}

function makePin(fill: string, border: string, glyphId: string): PinIcon {
  const key = `${fill}~${border}~${glyphId}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPinSVG(fill, border, glyphId))}`;
  const icon: PinIcon = {
    url,
    id: key,
    width: RASTER,
    height: RASTER,
    anchorY: RASTER,
  };
  iconCache.set(key, icon);
  return icon;
}

/* ------------------------------------------------------------------
   Per-mode fill/border resolution, shared by the pin icon and the
   focus-halo color so both come from one place.
   ------------------------------------------------------------------ */

function styleFor(
  report: DashboardReport,
  mode: MarkerColorMode,
): { fill: string; border: string } {
  if (mode === "progress") {
    switch (report.status) {
      case "dispatched":
        return { fill: PROGRESS_DISPATCHED, border: WHITE_BORDER };
      case "in_progress":
      case "closed":
        return { fill: PROGRESS_GREEN, border: WHITE_BORDER };
      // open + the normally-filtered merged/rejected fall back to the white pin.
      default:
        return { fill: "#ffffff", border: OPEN_BORDER };
    }
  }
  if (mode === "urgency") {
    const idx = Math.min(5, Math.max(1, report.severity)) - 1;
    return { fill: URGENCY_COLORS[idx], border: WHITE_BORDER };
  }
  const teamId: TeamId =
    report.assigned_team ?? categoryToTeam(report.category);
  return {
    fill: TEAMS[teamId]?.color ?? TEAMS.general_admin.color,
    border: WHITE_BORDER,
  };
}

/** IconLayer getIcon accessor: report + color mode -> cached teardrop icon.
 * Every pin carries its category glyph; completed pins override with a check.
 * Unknown/missing icon names fall back to help-circle (never a broken pin). */
export function pinIconFor(
  report: DashboardReport,
  mode: MarkerColorMode,
): PinIcon {
  const { fill, border } = styleFor(report, mode);
  const glyphId =
    report.status === "closed"
      ? "check"
      : (CATEGORY_META[report.category]?.icon ?? "help-circle");
  return makePin(fill, border, glyphId);
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGB tuple for the focus halo, matched to the pin fill for the active mode.
 * The white "open" pin maps to slate so the ring reads on a light basemap. */
export function pinColorRGB(
  report: DashboardReport,
  mode: MarkerColorMode,
): [number, number, number] {
  const { fill } = styleFor(report, mode);
  if (fill.toLowerCase() === "#ffffff") return [60, 66, 82];
  return hexToRgb(fill);
}

/* ------------------------------------------------------------------
   Legend metadata, the report-map legend renders straight from these
   so no color literal is duplicated in JSX.
   ------------------------------------------------------------------ */

export interface LegendSwatch {
  color: string;
  label: string;
  /** Border for pale swatches (the white "open" pin) so they stay visible. */
  border?: string;
  /** Draw a check inside the swatch (completed pins). */
  check?: boolean;
}

export const PROGRESS_LEGEND: LegendSwatch[] = [
  { color: "#ffffff", label: "Open", border: OPEN_BORDER },
  { color: PROGRESS_DISPATCHED, label: "Dispatched" },
  { color: PROGRESS_GREEN, label: "In progress" },
  { color: PROGRESS_GREEN, label: "Completed", check: true },
];

export const URGENCY_LEGEND = {
  colors: URGENCY_COLORS,
  minLabel: "Low",
  maxLabel: "Critical",
} as const;

/** Teams actually present in the given reports, most-frequent first, capped. */
export function teamLegend(
  reports: DashboardReport[],
  cap = 6,
): { entries: LegendSwatch[]; more: number } {
  const counts = new Map<TeamId, number>();
  for (const r of reports) {
    const id = r.assigned_team ?? categoryToTeam(r.category);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const entries: LegendSwatch[] = sorted.slice(0, cap).map(([id]) => ({
    color: TEAMS[id]?.color ?? TEAMS.general_admin.color,
    label: TEAMS[id]?.shortLabel ?? "Other",
  }));
  return { entries, more: Math.max(0, sorted.length - cap) };
}

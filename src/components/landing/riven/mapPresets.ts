import type { StyleSpecification } from "maplibre-gl";
import { SATELLITE_STYLE } from "@/components/map/satellite-style";

// deck.gl layer builders live in ./mapLayers — kept out of this module so the
// heavy @deck.gl/* imports don't enter the landing route's critical path
// (MapPresetContext imports the preset data below at module load). The builders
// are imported only by the lazily-loaded ZampMapBackdrop.

/**
 * Landing-hero map presets — the "looks" the tweaks menu switches between.
 *
 * The hero map is a non-interactive BACKDROP (pointer-events-none), so each
 * preset is a self-contained visual recipe: basemap + camera + which render
 * mode (DOM marker pins vs a deck.gl aggregation overlay) + scrim + motion +
 * which ink the hero wordmark needs to stay legible over it.
 *
 * The deck.gl layer constants (colorRange / radius / intensity) are copied —
 * deliberately, not imported — from components/map/report-map.tsx so the two
 * maps read as one family without coupling the landing page to the dashboard's
 * DashboardReport type. If you retune one, eyeball the other.
 */

export const CUMMING: [number, number] = [-84.1402, 34.2073];

export type PinStatus = "open" | "dispatched" | "in_progress" | "closed";

export type CivicPoint = {
  id: number;
  lng: number;
  lat: number;
  status: PinStatus;
  severity: number;
};

// Mirrors statusColor() in components/map/report-map.tsx.
export function statusColor(
  status: PinStatus,
  severity: number,
): [number, number, number] {
  if (status === "closed") return [48, 209, 88];
  if (status === "dispatched") return [10, 132, 255];
  if (status === "in_progress") return [90, 200, 250];
  if (severity >= 4) return [255, 69, 58];
  return [255, 159, 10];
}

export function rgbCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r},${g},${b})`;
}

/**
 * Deterministic synthetic report field — a seeded LCG so the same points
 * render every time (no flicker, identical SSR/CSR). Area-uniform (sqrt radius)
 * within ~3.5km of Cumming center, latitude squeezed 0.7× to sit inside the
 * tilted frame. Richer than the old 38-pin field so the heat/hex aggregations
 * have something to bin.
 */
export function makePoints(count: number): CivicPoint[] {
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const STATUS_WEIGHTS: { status: PinStatus; weight: number }[] = [
    { status: "closed", weight: 0.42 },
    { status: "dispatched", weight: 0.22 },
    { status: "in_progress", weight: 0.16 },
    { status: "open", weight: 0.2 },
  ];
  const pickStatus = (): PinStatus => {
    const r = rand();
    let acc = 0;
    for (const s of STATUS_WEIGHTS) {
      acc += s.weight;
      if (r <= acc) return s.status;
    }
    return "closed";
  };
  const [lng0, lat0] = CUMMING;
  // Four seeded hotspots within ~3km of center. Most points cluster around them
  // so report DENSITY varies across space — uniform-random reads as one flat
  // color in the hex/heat aggregations (vision QA: hexes were monochrome). The
  // wide-but-sparse fringe keeps the frame filled.
  const HOTSPOTS = Array.from({ length: 4 }, () => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.03;
    return [lng0 + Math.cos(a) * r, lat0 + Math.sin(a) * r * 0.78] as const;
  });
  return Array.from({ length: count }, (_, id) => {
    let lng: number;
    let lat: number;
    if (rand() < 0.68) {
      const [hl, ht] = HOTSPOTS[Math.floor(rand() * HOTSPOTS.length)];
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.014;
      lng = hl + Math.cos(a) * r;
      lat = ht + Math.sin(a) * r * 0.78;
    } else {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.052;
      lng = lng0 + Math.cos(a) * r;
      lat = lat0 + Math.sin(a) * r * 0.78;
    }
    const status = pickStatus();
    // ~30% of open reports escalate to sev 4-5 (renders red via statusColor).
    const severity =
      status === "open"
        ? rand() < 0.3
          ? 4 + Math.round(rand())
          : 1 + Math.floor(rand() * 3)
        : 1 + Math.floor(rand() * 5);
    return { id, lng, lat, status, severity };
  });
}

/* ------------------------------------------------------------------
   Esri World Imagery raster "satellite" basemap is shared from
   components/map/satellite-style (single source of truth for the Esri
   maxzoom cap, also used by the dashboard ReportMap).
   ------------------------------------------------------------------ */

const STYLE_VOYAGER =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const STYLE_POSITRON =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ------------------------------------------------------------------
   Presets
   ------------------------------------------------------------------ */
export type MapInk = "dark" | "light";
export type MapView = "markers" | "heatmap" | "hex";

export type MapPreset = {
  id: string;
  label: string;
  blurb: string;
  basemap: string | StyleSpecification;
  ink: MapInk; // wordmark/nav ink needed for contrast over this basemap
  view: MapView;
  camera: { zoom: number; bearing: number; pitch: number };
  motion: { orbit: boolean; spin: boolean; pulse: boolean };
  // Extrude the basemap's building footprints into 3D (Carto vector tiles carry
  // render_height). Only valid on the Carto vector basemaps (source id "carto").
  buildings3d?: boolean;
  // CSS filter applied to the whole map canvas — combats washed-out basemaps
  // and boosts pin/neon saturation (vision QA).
  mapFilter: string;
  // CSS background for the scrim overlay that seats the hero copy.
  scrim: string;
  // Two-stop gradient for the menu chip swatch.
  swatch: [string, string];
};

/**
 * 3D building extrusion — added on top of the Carto vector basemap (source id
 * "carto", source-layer "building", which carries render_height /
 * render_min_height). Spread into a react-map-gl <Layer>. Height-graded blue
 * so taller blocks read brighter; kept dim so the status pins stay the hero.
 */
export const BUILDINGS_3D_LAYER = {
  id: "civic-3d-buildings",
  type: "fill-extrusion" as const,
  source: "carto",
  "source-layer": "building",
  minzoom: 13,
  paint: {
    "fill-extrusion-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "render_height"], ["get", "height"], 6],
      0,
      "#2e3f62",
      20,
      "#3d5a9a",
      60,
      "#5a82d4",
    ],
    "fill-extrusion-height": [
      "coalesce",
      ["get", "render_height"],
      ["get", "height"],
      8,
    ],
    "fill-extrusion-base": [
      "coalesce",
      ["get", "render_min_height"],
      ["get", "min_height"],
      0,
    ],
    "fill-extrusion-opacity": 0.96,
  },
} as const;

export const LIGHT_SCRIM = [
  "radial-gradient(120% 95% at 50% 36%, rgba(10,132,255,0.14) 0%, transparent 60%)",
  "linear-gradient(to top, rgba(239,239,239,0.86) 0%, rgba(239,239,239,0.22) 30%, rgba(239,239,239,0) 50%)",
].join(", ");

const DARK_SCRIM = [
  // Top fade seats the nav over the dark map (vision QA: nav floated on texture).
  "linear-gradient(to bottom, rgba(8,10,18,0.55) 0%, transparent 13%)",
  "radial-gradient(120% 95% at 50% 34%, rgba(10,132,255,0.20) 0%, transparent 58%)",
  "linear-gradient(to top, rgba(8,10,18,0.92) 0%, rgba(8,10,18,0.45) 28%, rgba(8,10,18,0.08) 50%, rgba(8,10,18,0) 64%)",
].join(", ");

const SAT_SCRIM = [
  "linear-gradient(to bottom, rgba(6,10,16,0.5) 0%, transparent 13%)",
  "radial-gradient(120% 95% at 50% 34%, rgba(10,132,255,0.16) 0%, transparent 58%)",
  "linear-gradient(to top, rgba(6,10,16,0.88) 0%, rgba(6,10,16,0.40) 30%, rgba(6,10,16,0) 56%)",
].join(", ");

// Heavier top fade than DARK_SCRIM — at the high pitch of the 3D city the upper
// frame is empty horizon/sky, so we fade it to atmosphere and seat the nav.
const CITY3D_SCRIM = [
  "linear-gradient(to bottom, rgba(8,10,18,0.96) 0%, rgba(8,10,18,0.5) 16%, rgba(8,10,18,0) 36%)",
  "radial-gradient(120% 90% at 50% 32%, rgba(10,132,255,0.16) 0%, transparent 56%)",
  "linear-gradient(to top, rgba(8,10,18,0.92) 0%, rgba(8,10,18,0.42) 26%, rgba(8,10,18,0) 50%)",
].join(", ");

export const PRESETS: MapPreset[] = [
  {
    id: "civic-light",
    label: "Civic Light",
    blurb: "Colorful streets · status pins",
    basemap: STYLE_VOYAGER,
    ink: "dark",
    view: "markers",
    camera: { zoom: 12.4, bearing: -18, pitch: 50 },
    motion: { orbit: true, spin: false, pulse: true },
    mapFilter: "saturate(1.22) contrast(1.06)",
    scrim: LIGHT_SCRIM,
    swatch: ["#7cc4ff", "#eaf3ff"],
  },
  {
    id: "aurora-heat",
    label: "Aurora Heat",
    blurb: "Density heatmap · severity-weighted",
    basemap: STYLE_POSITRON,
    ink: "dark",
    view: "heatmap",
    camera: { zoom: 12.2, bearing: -10, pitch: 32 },
    motion: { orbit: true, spin: false, pulse: false },
    mapFilter: "saturate(1.12) contrast(1.04)",
    scrim: LIGHT_SCRIM,
    swatch: ["#0a84ff", "#ffd700"],
  },
  {
    id: "midnight-neon",
    label: "Midnight Neon",
    blurb: "Dark basemap · glowing pins",
    basemap: STYLE_DARK,
    ink: "light",
    view: "markers",
    camera: { zoom: 12.4, bearing: -18, pitch: 55 },
    motion: { orbit: true, spin: false, pulse: true },
    mapFilter: "saturate(1.3) brightness(1.08)",
    scrim: DARK_SCRIM,
    swatch: ["#0a84ff", "#bf5af2"],
  },
  {
    id: "hex-city",
    label: "Hex City",
    blurb: "3D hex bins · rotating",
    basemap: STYLE_DARK,
    ink: "light",
    view: "hex",
    camera: { zoom: 12.1, bearing: -24, pitch: 55 },
    motion: { orbit: false, spin: true, pulse: false },
    mapFilter: "saturate(1.25) brightness(1.06)",
    scrim: DARK_SCRIM,
    swatch: ["#5ac8fa", "#ffd700"],
  },
  {
    id: "city-3d",
    label: "3D City",
    blurb: "Tilted 3D buildings · live pins",
    basemap: STYLE_DARK,
    ink: "light",
    view: "markers",
    camera: { zoom: 16, bearing: -20, pitch: 60 },
    motion: { orbit: false, spin: true, pulse: true },
    buildings3d: true,
    mapFilter: "saturate(1.2) brightness(1.06)",
    scrim: CITY3D_SCRIM,
    swatch: ["#33425f", "#52689c"],
  },
  {
    id: "satellite",
    label: "Satellite",
    blurb: "Aerial imagery · bright pins",
    basemap: SATELLITE_STYLE,
    ink: "light",
    view: "markers",
    camera: { zoom: 13, bearing: -18, pitch: 50 },
    motion: { orbit: true, spin: false, pulse: true },
    mapFilter: "saturate(1.12) contrast(1.06)",
    scrim: SAT_SCRIM,
    swatch: ["#3f8f4f", "#cda06a"],
  },
];

export const DEFAULT_PRESET_ID = "civic-light";

export function getPreset(id: string | null | undefined): MapPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

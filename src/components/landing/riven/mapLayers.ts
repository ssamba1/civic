import { HeatmapLayer, HexagonLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { type CivicPoint, type MapInk, statusColor } from "./mapPresets";

/**
 * deck.gl layer builders for the hero backdrop's aggregation views.
 *
 * Split out of mapPresets.ts on purpose: mapPresets holds the lightweight
 * preset DATA, which MapPresetContext imports at module load, on the landing
 * route's critical path. Keeping the heavy @deck.gl/* imports here (only the
 * lazily-loaded ZampMapBackdrop imports this file) means deck.gl never enters
 * the initial bundle. Marker views render via these layers too (NOT DOM <Marker>
 * pins, which collide with the interleaved deck overlay's canvas container).
 */

export function buildHeatLayer(points: CivicPoint[]): Layer[] {
  return [
    new HeatmapLayer<CivicPoint>({
      id: "hero-heat",
      data: points,
      getPosition: (p) => [p.lng, p.lat],
      getWeight: (p) => p.severity,
      // Tighter kernel + higher intensity so clusters develop hot orange/red
      // cores instead of staying a diffuse cyan smear (vision QA).
      radiusPixels: 70,
      intensity: 1.8,
      threshold: 0.04,
      weightsTextureSize: 1024,
      colorRange: [
        [10, 132, 255, 0],
        [20, 150, 255, 110],
        [90, 200, 250, 165],
        [191, 90, 242, 205],
        [255, 159, 10, 235],
        [255, 69, 58, 255],
      ],
    }),
  ];
}

/**
 * Marker view as deck.gl layers, a soft status-colored glow ring + a crisp
 * core dot, copied from report-map.tsx's glow/dots layers. pickable is off
 * everywhere (it's a backdrop) so deck never does ReadPixels picking, which
 * otherwise stalls the GPU.
 */
export function buildMarkerLayers(points: CivicPoint[], ink: MapInk): Layer[] {
  // White core outline reads on light basemaps; on dark we let the color glow.
  const lineAlpha = ink === "light" ? 235 : 200;
  const glow = new ScatterplotLayer<CivicPoint>({
    id: "hero-glow",
    data: points,
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    pickable: false,
    stroked: false,
    filled: true,
    radiusUnits: "meters",
    radiusMinPixels: 9,
    radiusMaxPixels: 40,
    getPosition: (p) => [p.lng, p.lat],
    getRadius: (p) => 90 + p.severity * 42,
    getFillColor: (p) => {
      const [r, g, b] = statusColor(p.status, p.severity);
      return [r, g, b, ink === "light" ? 60 : 46];
    },
  });
  const dots = new ScatterplotLayer<CivicPoint>({
    id: "hero-dots",
    data: points,
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    pickable: false,
    stroked: true,
    filled: true,
    radiusUnits: "meters",
    radiusMinPixels: 4.5,
    radiusMaxPixels: 16,
    lineWidthMinPixels: 1.5,
    lineWidthUnits: "pixels",
    getPosition: (p) => [p.lng, p.lat],
    getRadius: (p) => 26 + p.severity * 14,
    getFillColor: (p) => {
      const [r, g, b] = statusColor(p.status, p.severity);
      return [r, g, b, 235];
    },
    getLineColor: () => [255, 255, 255, lineAlpha],
  });
  return [glow, dots];
}

export function buildHexLayer(points: CivicPoint[], is3D: boolean): Layer[] {
  return [
    new HexagonLayer<CivicPoint>({
      id: "hero-hex",
      data: points,
      extruded: is3D,
      radius: 220,
      elevationScale: is3D ? 16 : 0,
      getPosition: (p) => [p.lng, p.lat],
      colorRange: [
        [10, 132, 255, 150],
        [90, 200, 250, 185],
        [191, 90, 242, 210],
        [255, 159, 10, 230],
        [255, 69, 58, 245],
        [255, 215, 0, 255],
      ],
      // Mild outlier cap so one mega-bin doesn't own the whole color domain;
      // the clustered point field (makePoints) supplies the low→high spread that
      // makes bins range across the full blue→gold ramp (vision QA).
      upperPercentile: 97,
      coverage: 0.92,
      opacity: 0.85,
      material: false,
    }),
  ];
}

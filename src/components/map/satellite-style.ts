import type { StyleSpecification } from "maplibre-gl";

/* ------------------------------------------------------------------
   Esri World Imagery raster basemap — the shared "satellite" style.
   Single source of truth: imported by both report-map.tsx (interactive
   dashboard map) and landing/riven/mapPresets.ts (hero backdrop). These
   were previously copy-pasted, which let them drift — keep them unified.
   ------------------------------------------------------------------ */

// Esri's World_Imagery serves real aerial tiles only up to a per-region
// max zoom. Over Ahilyanagar (and most of urban India) that ceiling is
// z18 — requesting z19+ returns a 2.5KB "Map data not yet available"
// grey placeholder tile (HTTP 200, so MapLibre can't detect it as missing
// and won't auto-overzoom). Capping maxzoom at 18 makes MapLibre overzoom
// (upscale the sharp z18 tile) past z18 instead of showing the placeholder.
// Verified 2026-07 by probing the tile endpoint at the city center
// (19.0948, 74.748): z14–18 = 14–24KB distinct JPEGs, z19/20/21 = identical
// 2521-byte placeholder. Raise this only for regions with deeper coverage.
const ESRI_MAX_ZOOM = 18;

export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      // tileSize: 128 forces maplibre to fetch tiles one zoom level deeper
      // than the displayed zoom to cover the same area — oversamples the
      // raster so it stays sharp at HiDPI and when zoomed out. Trade-off:
      // ~4× tile fetches; cached aggressively by the browser/CDN. Because
      // this shifts requests one level deeper, the maxzoom cap below is what
      // keeps the deepest request at z18 (real imagery) rather than z19.
      tileSize: 128,
      maxzoom: ESRI_MAX_ZOOM,
      attribution: "Esri",
    },
  },
  layers: [
    {
      id: "sat-layer",
      type: "raster",
      source: "sat",
      paint: {
        // Snap tiles in fast — default 300ms makes panning feel "blurry then
        // sharp"; 100ms reads as instant while still hiding raw seams.
        "raster-fade-duration": 100,
      },
    },
  ],
};

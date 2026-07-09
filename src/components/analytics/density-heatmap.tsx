"use client";

/**
 * DensityHeatmap — client component.
 *
 * Renders a MapLibre GL map (react-map-gl v8, no Mapbox token) with either a
 * deck.gl HeatmapLayer or a GridLayer overlay. Deck.gl is dynamically imported
 * to prevent SSR choke on browser-only APIs.
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapGL } from "react-map-gl/maplibre";
import type { HeatmapPoint, ViewportBounds } from "@/lib/analytics/heatmap";

// ---------------------------------------------------------------------------
// Map style — reuse the same Carto dark-matter style the main report map uses.
// ---------------------------------------------------------------------------
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DensityHeatmapProps {
  points: HeatmapPoint[];
  bounds: ViewportBounds | null;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend({ mode }: { mode: "heatmap" | "grid" }) {
  return (
    <div className="absolute bottom-8 left-3 z-10 rounded-lg bg-black/70 px-3 py-2 text-xs text-white backdrop-blur-sm">
      <p className="mb-1 font-semibold tracking-wide uppercase opacity-70">
        {mode === "heatmap" ? "Density" : "Report count"}
      </p>
      {mode === "heatmap" ? (
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 rounded-full bg-gradient-to-r from-blue-400 via-yellow-300 to-red-500" />
          <span className="opacity-60">Low → High</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 rounded-full bg-gradient-to-r from-emerald-400 to-red-500" />
          <span className="opacity-60">Few → Many</span>
        </div>
      )}
      <p className="mt-1 opacity-50 text-[10px]">
        Weight = severity × recency (90-day decay)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <svg
        className="h-10 w-10 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 20.25H6a3.75 3.75 0 0 1-3.75-3.75V6.75A3.75 3.75 0 0 1 6 3h12a3.75 3.75 0 0 1 3.75 3.75v4.5M12 15l3 3m0 0 3-3m-3 3V9"
        />
      </svg>
      <p className="text-sm">No report data available for this city yet.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DensityHeatmap({ points, bounds }: DensityHeatmapProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ForwardRefExoticComponent can't satisfy `new(...)` constraint
  const mapRef = useRef<any>(null);
  const [mode, setMode] = useState<"heatmap" | "grid">("heatmap");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [deckOverlay, setDeckOverlay] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deck.gl overlay has no typed export we can import without SSR
    overlay: any;
    updateLayers: (layers: any[]) => void;
  } | null>(null);

  const initialViewState = useMemo(
    () =>
      bounds
        ? {
            longitude: bounds.center[0],
            latitude: bounds.center[1],
            zoom: bounds.zoom,
          }
        : { longitude: -84.14, latitude: 34.27, zoom: 11 },
    [bounds],
  );

  // Dynamically load deck.gl to avoid SSR issues.
  // Stores the overlay instance so the single registration effect below can
  // attach it once both the map AND the overlay are ready.
  useEffect(() => {
    let cancelled = false;
    let createdOverlay: any = null;

    async function load() {
      const [{ MapboxOverlay }] = await Promise.all([
        import("@deck.gl/mapbox") as Promise<{ MapboxOverlay: any }>,
      ]);
      if (cancelled) return;

      const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
      createdOverlay = overlay;

      const updateLayers = (layers: any[]) => {
        overlay.setProps({ layers });
      };

      if (cancelled) return;
      setDeckOverlay({ overlay, updateLayers });
    }

    load();

    return () => {
      cancelled = true;
      // Tear down the WebGL overlay to prevent resource leaks on unmount.
      // If it has already been added to a map, finalize() removes it too.
      if (createdOverlay) {
        try {
          createdOverlay.finalize();
        } catch {
          // Overlay was never attached — safe to ignore
        }
        createdOverlay = null;
      }
    };
  }, []);

  // Single registration path: attach the overlay to the map only once BOTH the
  // map has fired its onLoad event AND the async deck.gl import has resolved.
  // Guarding on `mapLoaded` covers ordering (a): map-first.
  // Guarding on `deckOverlay` covers ordering (b): overlay-first.
  // No double-add risk because addControl on an already-added control throws —
  // caught and ignored — and we never call it from onLoad anymore.
  useEffect(() => {
    if (!mapLoaded || !deckOverlay || !mapRef.current) return;
    const map = mapRef.current.getMap?.();
    if (!map) return;
    try {
      map.addControl(deckOverlay.overlay);
    } catch {
      // Already added — no-op
    }
  }, [mapLoaded, deckOverlay]);

  // Update deck.gl layers whenever mode or points change
  useEffect(() => {
    if (!deckOverlay) return;

    async function buildLayers() {
      const [{ HeatmapLayer }, { GridLayer }] = await Promise.all([
        import("@deck.gl/aggregation-layers") as Promise<{ HeatmapLayer: any }>,
        import("@deck.gl/aggregation-layers") as Promise<{ GridLayer: any }>,
      ]);

      if (mode === "heatmap") {
        const layer = new HeatmapLayer({
          id: "report-heatmap",
          data: points,
          getPosition: (d: HeatmapPoint) => d.position,
          getWeight: (d: HeatmapPoint) => d.weight,
          radiusPixels: 40,
          intensity: 1.5,
          threshold: 0.03,
          colorRange: [
            [63, 174, 252, 180],
            [114, 220, 109, 200],
            [254, 211, 56, 220],
            [253, 128, 41, 230],
            [215, 30, 30, 255],
          ],
        });
        deckOverlay?.updateLayers([layer]);
      } else {
        const layer = new GridLayer({
          id: "report-grid",
          data: points,
          getPosition: (d: HeatmapPoint) => d.position,
          getColorWeight: (d: HeatmapPoint) => d.weight,
          getElevationWeight: (d: HeatmapPoint) => d.weight,
          cellSize: 500,
          elevationScale: 200,
          extruded: true,
          colorRange: [
            [52, 211, 153, 180],
            [251, 191, 36, 200],
            [239, 68, 68, 230],
          ],
          pickable: true,
        });
        deckOverlay?.updateLayers([layer]);
      }
    }

    buildLayers();
  }, [deckOverlay, mode, points]);

  // Signal that the map is ready so the registration effect can fire.
  const handleMapLoad = (_evt: { target: unknown }) => {
    setMapLoaded(true);
  };

  if (points.length === 0) {
    return (
      <div className="relative h-full w-full rounded-xl border border-border overflow-hidden bg-card">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full rounded-xl border border-border overflow-hidden">
      {/* Mode toggle */}
      <div className="absolute top-3 right-3 z-10 flex rounded-lg overflow-hidden border border-white/20 text-xs font-medium shadow-lg">
        <button
          type="button"
          onClick={() => setMode("heatmap")}
          className={`px-3 py-1.5 transition-colors ${
            mode === "heatmap"
              ? "bg-white text-black"
              : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          Heatmap
        </button>
        <button
          type="button"
          onClick={() => setMode("grid")}
          className={`px-3 py-1.5 transition-colors ${
            mode === "grid"
              ? "bg-white text-black"
              : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          Grid
        </button>
      </div>

      {/* Point count badge */}
      <div className="absolute top-3 left-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm">
        {points.length.toLocaleString()} report{points.length !== 1 ? "s" : ""}
      </div>

      <MapGL
        ref={mapRef as any}
        initialViewState={initialViewState}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        onLoad={handleMapLoad as any}
        attributionControl={false}
      />

      <Legend mode={mode} />
    </div>
  );
}

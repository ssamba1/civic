"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo } from "react";
import { Layer, Map as MapLibreMap, Source } from "react-map-gl/maplibre";
import { boundingBox } from "@/lib/onboarding/ingest/geo";
import type { BoundaryGeometry } from "@/lib/onboarding/tiger";

const STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Read-only preview of a city's TIGER boundary (wizard Step 2). Outlines the
 *  polygon in the brand blue and auto-fits the viewport to it. */
export function BoundaryMap({ boundary }: { boundary: BoundaryGeometry }) {
  const bbox = useMemo(() => boundingBox(boundary), [boundary]);
  const data = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: boundary,
      properties: {},
    }),
    [boundary],
  );

  return (
    <MapLibreMap
      initialViewState={{
        bounds: [
          [bbox.minLng, bbox.minLat],
          [bbox.maxLng, bbox.maxLat],
        ],
        fitBoundsOptions: { padding: 28 },
      }}
      mapStyle={STYLE_DARK}
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
    >
      <Source id="city-boundary" type="geojson" data={data as never}>
        <Layer
          id="city-boundary-fill"
          type="fill"
          paint={{ "fill-color": "#0a84ff", "fill-opacity": 0.12 }}
        />
        <Layer
          id="city-boundary-line"
          type="line"
          paint={{ "line-color": "#0a84ff", "line-width": 2 }}
        />
      </Source>
    </MapLibreMap>
  );
}

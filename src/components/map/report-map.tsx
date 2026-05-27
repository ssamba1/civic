"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Supercluster from "supercluster";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { renderPopupHTML } from "@/components/map/map-popup";

interface ReportMapProps {
  reports: DashboardReport[];
  center: [number, number];
  zoom: number;
  mapboxToken: string;
  focusId?: string | null;
}

type ReportFeature = GeoJSON.Feature<
  GeoJSON.Point,
  DashboardReport & { cluster?: never }
>;

export function ReportMap({
  reports,
  center,
  zoom,
  mapboxToken,
  focusId,
}: ReportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const clusterRef = useRef<Supercluster | null>(null);

  // Memoized so the reference only changes when reports data actually changes,
  // preventing the marker-update effect from re-running on unrelated parent renders.
  const features = useMemo<ReportFeature[]>(
    () =>
      reports.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.location.lng, r.location.lat] },
        properties: r,
      })),
    [reports],
  );

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;

    // clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const bounds = map.getBounds();
    if (!bounds) return;
    const z = Math.floor(map.getZoom());

    const clusters = cluster.getClusters(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      z,
    );

    for (const feature of clusters) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;

      if (props.cluster) {
        // cluster marker
        const count = props.point_count as number;
        const el = document.createElement("div");
        el.className = "civic-cluster-marker";
        el.style.cssText = `
          width: ${32 + Math.min(count, 100) * 0.3}px;
          height: ${32 + Math.min(count, 100) * 0.3}px;
          background: #2563eb;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: pointer;
        `;
        el.textContent = count.toString();

        el.addEventListener("click", () => {
          const expansionZoom = Math.min(
            cluster.getClusterExpansionZoom(props.cluster_id as number),
            18,
          );
          map.easeTo({ center: [lng, lat], zoom: expansionZoom });
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.push(marker);
      } else {
        // single report marker
        const report = props as unknown as DashboardReport;
        const meta = CATEGORY_META[report.category];

        const el = document.createElement("div");
        el.style.cssText = `
          width: 14px;
          height: 14px;
          background: ${meta.color};
          border-radius: 50%;
          border: 2.5px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: transform 0.15s;
        `;
        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.4)";
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        el.addEventListener("click", () => {
          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({
            offset: 12,
            maxWidth: "300px",
            closeButton: true,
          })
            .setLngLat([lng, lat])
            .setHTML(renderPopupHTML(report))
            .addTo(map);
        });

        // auto-open popup if this report is focused
        if (focusId && report.id === focusId) {
          map.easeTo({ center: [lng, lat], zoom: 15, duration: 800 });
          setTimeout(() => {
            popupRef.current?.remove();
            popupRef.current = new mapboxgl.Popup({
              offset: 12,
              maxWidth: "300px",
              closeButton: true,
            })
              .setLngLat([lng, lat])
              .setHTML(renderPopupHTML(report))
              .addTo(map);
          }, 850);
        }

        markersRef.current.push(marker);
      }
    }
  }, [focusId]);

  // Effect 1 — Map initialization only. Runs once per token/center/zoom change.
  // map.remove() lives here so it only fires when the map itself needs to be rebuilt,
  // not on every reports/focusId change.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    mapRef.current = map;

    // Register move listener — markers are refreshed by Effect 2 via updateMarkers,
    // but moveend also needs to re-cluster at the new viewport.
    map.on("moveend", updateMarkers);

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, [mapboxToken, center, zoom, updateMarkers]);

  // Effect 2 — Marker / cluster updates. Runs whenever reports data or focusId changes.
  // Never calls map.remove(), so the map instance survives parent re-renders.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Rebuild supercluster index with latest features
    const cluster = new Supercluster({ radius: 60, maxZoom: 16 });
    cluster.load(features);
    clusterRef.current = cluster;

    const applyMarkers = () => {
      updateMarkers();

      // Fit bounds to reports on initial data load (no focus active)
      if (features.length > 0 && !focusId) {
        const bounds = new mapboxgl.LngLatBounds();
        for (const f of features) {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    };

    if (map.loaded()) {
      applyMarkers();
    } else {
      map.once("load", applyMarkers);
    }
  }, [features, focusId, updateMarkers]);

  return (
    <div
      ref={containerRef}
      className="h-[400px] w-full rounded-xl border border-zinc-200 shadow-sm lg:h-[500px]"
      role="application"
      aria-label="Map showing infrastructure reports"
    />
  );
}

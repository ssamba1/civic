"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Supercluster from "supercluster";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { renderPopupHTML } from "@/components/map/map-popup";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { 
  Settings, 
  Map as MapIcon, 
  Layers, 
  Sliders, 
  ChevronRight, 
  RotateCcw,
  Star,
  Camera,
  Flame
} from "lucide-react";

interface ReportMapProps {
  reports: DashboardReport[];
  center: [number, number]; // [lng, lat]
  zoom: number;
  focusId?: string | null;
  hoverId?: string | null;
  onSelectMarker?: (id: string) => void;
  minSeverity?: number;
  setMinSeverity?: (s: number) => void;
  activeStatuses?: ReportStatus[];
  setActiveStatuses?: (s: ReportStatus[]) => void;
  selectedCategory?: ReportCategory | null;
  setSelectedCategory?: (c: ReportCategory | null) => void;
  isFullscreen?: boolean;
}

type ReportFeature = GeoJSON.Feature<
  GeoJSON.Point,
  DashboardReport & { cluster?: never }
>;

/* ------------------------------------------------------------------
   Vector SVG Icons for Leaflet Markers (custom raw paths)
   ------------------------------------------------------------------ */
function getCategorySVG(category: ReportCategory, color: string): string {
  const stroke = color;
  const common = `xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`;
  
  switch (category) {
    case "pothole":
      return `<svg ${common}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    case "streetlight":
      return `<svg ${common}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
    case "water_leak":
      return `<svg ${common}><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.09 3 12.25c0 2.22 1.8 4.05 4 4.05z"/></svg>`;
    case "sidewalk_damage":
      return `<svg ${common}><path d="M4 16v-2a2 2 0 1 1 4 0v2"/><path d="M12 14v-2a2 2 0 1 1 4 0v2"/><path d="M8 20h8"/></svg>`;
    case "tree_down":
      return `<svg ${common}><path d="M17 22H7"/><path d="M10 22v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1-1v3"/><path d="M12 3L5 12h14z"/></svg>`;
    case "downed_sign":
    case "faded_signage":
      return `<svg ${common}><path d="M12 3v19"/><rect x="5" y="5" width="14" height="10" rx="2"/></svg>`;
    case "graffiti":
      return `<svg ${common}><path d="M12 3a3 3 0 0 0-3 3v13a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M9 11h6"/></svg>`;
    case "illegal_dump":
      return `<svg ${common}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><rect x="9" y="2" width="6" height="4" rx="1"/></svg>`;
    case "drainage":
      return `<svg ${common}><path d="M2 6c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 13c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
    case "debris":
      return `<svg ${common}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h12"/></svg>`;
    default:
      return `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }
}

/* ------------------------------------------------------------------
   FreightGhost Premium Color Palette Mappings
   ------------------------------------------------------------------ */
function getSeverityColor(s: number): string {
  if (s >= 5) return "#ff4757"; // Neon Coral (Danger hotspot)
  if (s >= 4) return "#f97316"; // Bright Orange
  if (s >= 3) return "#6366f1"; // Electric Indigo (Primary / Mediation level)
  if (s >= 2) return "#fbbf24"; // Amber Glow
  return "#10b981"; // Emerald Glow (On-time / Resolved status)
}

/* ------------------------------------------------------------------
   MapController — Internal Leaflet orchestrator (highly robust)
   ------------------------------------------------------------------ */
function MapController({
  reports,
  focusId,
  hoverId,
  onSelectMarker,
  layerMode,
  is3D,
}: Pick<ReportMapProps, "reports" | "focusId" | "hoverId" | "onSelectMarker"> & { layerMode: string; is3D: boolean }) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const clusterRef = useRef<Supercluster | null>(null);
  const osmbRef = useRef<any>(null);

  // Manage 3D active classes on the Leaflet map container and its parent viewport
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    const viewport = container.parentElement;
    if (!viewport) return;

    if (is3D) {
      viewport.classList.add("map-3d-active");
      viewport.classList.remove("map-2d-active");
    } else {
      viewport.classList.add("map-2d-active");
      viewport.classList.remove("map-3d-active");
    }

    // Force Leaflet to recalculate size and load larger tile region immediately
    const timer = setTimeout(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch (e) {
        // Safe skip
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [map, is3D]);

  // Load and initialize 3D vector OSMBuildings layer dynamically
  useEffect(() => {
    if (!map || typeof window === "undefined") return;

    const initBuildings = () => {
      const OSMBuildingsClass = (window as any).OSMBuildings;
      if (!OSMBuildingsClass || osmbRef.current) return;

      try {
        const osmb = new OSMBuildingsClass(map);
        // Load global OpenStreetMap 3D building tiles
        osmb.load('https://{s}.data.osmbuildings.org/0.2/59fcc2e8/tile/{z}/{x}/{y}.json');
        
        // High-contrast Cyberpunk styling: Translucent Electric Indigo walls + High-opacity Cyan roofs
        osmb.style({
          color: "rgba(99, 102, 241, 0.55)",
          roofColor: "rgba(6, 182, 212, 0.9)"
        });
        
        osmbRef.current = osmb;
      } catch (e) {
        // Safe fail
      }
    };

    if ((window as any).OSMBuildings) {
      initBuildings();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.osmbuildings.org/classic/0.2.2b/OSMBuildings-Leaflet.js";
      script.async = true;
      script.onload = initBuildings;
      document.head.appendChild(script);
    }

    return () => {
      if (osmbRef.current) {
        try {
          osmbRef.current.destroy();
        } catch (e) {
          // Safe fail
        }
        osmbRef.current = null;
      }
    };
  }, [map]);

  // Convert reports into GeoJSON features for supercluster safely
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
    if (!map) return;
    const cluster = clusterRef.current;
    if (!cluster) return;

    // Clear existing markers safely
    for (const m of markersRef.current) {
      try {
        m.remove();
      } catch (e) {
        // Safe skip if marker already removed or invalid
      }
    }
    markersRef.current = [];

    let bounds: L.LatLngBounds;
    let z: number;
    try {
      bounds = map.getBounds();
      z = map.getZoom();
    } catch (e) {
      // Map instance is not ready or is currently unmounting
      return;
    }

    if (!bounds || typeof bounds.getWest !== "function") return;

    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();

    // Prevent crashing on uninitialized or invalid bounds (e.g. NaN viewports)
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) return;

    let clusters;
    try {
      clusters = cluster.getClusters([west, south, east, north], Math.floor(z));
    } catch (e) {
      return; // Safe exit if bounds are mathematically invalid for supercluster
    }

    for (const feature of clusters) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;

      // 1. CLUSTER MARKER RENDER
      if (props.cluster) {
        const count = props.point_count as number;
        
        let clusterColor = "#6366f1"; // Default Electric Indigo
        let avgSeverity = 3;
        
        try {
          const leaves = cluster.getLeaves(props.cluster_id as number, 100);
          const totalSeverity = leaves.reduce((sum, leaf) => sum + (leaf.properties.severity || 3), 0);
          avgSeverity = totalSeverity / leaves.length;
          
          if (avgSeverity >= 4.0) clusterColor = "#ff4757"; // Neon Coral for highly severe hot zones
          else if (avgSeverity >= 2.5) clusterColor = "#6366f1"; // Electric Indigo for warning levels
          else clusterColor = "#00ffff"; // Glowing Cyan for minor issues
        } catch (e) {
          // Fallback
        }

        const size = 38 + Math.min(count, 100) * 0.2;
        const el = document.createElement("div");
        el.className = "relative flex items-center justify-center cursor-pointer";
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        
        // Concentration Mode styling — concentric pulsing rings
        let innerHTML = "";
        if (layerMode === "concentration") {
          innerHTML = `
            <div class="absolute inset-0 rounded-full animate-ping opacity-15" style="background:${clusterColor}; animation-duration: 3s;"></div>
            <div class="absolute -inset-2 rounded-full border border-dashed opacity-25" style="border-color:${clusterColor};"></div>
            <div class="absolute inset-0 rounded-full flex items-center justify-center font-bold text-white shadow-lg border-2 border-white/90" style="background:${clusterColor}; font-size:12px;">
              ${count}
            </div>
          `;
        } else {
          // Standard cluster styled neatly
          innerHTML = `
            <div class="absolute inset-0 rounded-full flex items-center justify-center font-bold text-white shadow-md border-2 border-white" style="background:${clusterColor}; font-size:12px;">
              ${count}
            </div>
          `;
        }

        el.innerHTML = `
          <div class="marker-3d-glow" style="color: ${clusterColor}"></div>
          <div class="marker-3d-shadow"></div>
          <div class="marker-3d-tether" style="color: ${clusterColor}"></div>
          <div class="marker-3d-billboard relative flex items-center justify-center" style="width: 100%; height: 100%;">
            ${innerHTML}
          </div>
        `;

        const icon = L.divIcon({
          html: el,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        try {
          const marker = L.marker([lat, lng], { icon }).addTo(map);
          marker.on("click", () => {
            try {
              const expansionZoom = Math.min(
                cluster.getClusterExpansionZoom(props.cluster_id as number),
                18,
              );
              map.flyTo([lat, lng], expansionZoom, { 
                animate: true,
                duration: 0.4, 
                easeLinearity: 0.2 
              });
            } catch (e) {
              // Safe skip
            }
          });
          markersRef.current.push(marker);
        } catch (e) {
          // Safe skip
        }

      // 2. INDIVIDUAL MARKER RENDER
      } else {
        const report = props as unknown as DashboardReport;
        const meta = CATEGORY_META[report.category];
        const isFocused = focusId && report.id === focusId;
        const isHovered = hoverId && report.id === hoverId;
        const isHighlighted = isFocused || isHovered;

        const el = document.createElement("div");
        el.className = "group relative flex items-center justify-center cursor-pointer";
        
        const size = isHighlighted ? 36 : 28;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.zIndex = isHighlighted ? "999" : "10";

        let innerHTML = "";
        // A. PHOTO MODE
        if (layerMode === "photo" && report.photo_public_url) {
          innerHTML = `
            ${isHighlighted ? `<div class="absolute inset-0 rounded-full animate-ping opacity-35" style="background:${meta.color}; animation-duration: 1.5s;"></div>` : ""}
            <div class="absolute inset-0 rounded-full animate-pulse opacity-10" style="background:${meta.color};"></div>
            <div class="absolute inset-0 rounded-full border-2 bg-zinc-200 overflow-hidden shadow-lg transition-transform duration-200 group-hover:scale-115" style="border-color:${meta.color};">
              <img src="${report.photo_public_url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
            </div>
            <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border border-white flex items-center justify-center text-[9px] text-white font-bold shadow" style="background-color: ${meta.color};">
              ${meta.label.charAt(0)}
            </div>
          `;
        } 
        // B. CONCENTRATION HALO MODE (Single Point Glow)
        else if (layerMode === "concentration") {
          innerHTML = `
            <div class="absolute -inset-4 rounded-full" style="background: radial-gradient(circle, ${meta.color}55 0%, ${meta.color}00 70%); mix-blend-mode: screen;"></div>
            <div class="absolute inset-1 rounded-full animate-pulse" style="background:${meta.color}; opacity: 0.25;"></div>
            <div class="absolute inset-2 rounded-full border-2 bg-white shadow-md flex items-center justify-center transition-all duration-200" style="border-color:${meta.color};">
              <span class="w-1.5 h-1.5 rounded-full" style="background:${meta.color};"></span>
            </div>
          `;
        }
        // C. STANDARD DISPERSAL BADGE MODE (Clean Vector Badges)
        else {
          innerHTML = `
            ${isHighlighted ? `<div class="absolute inset-0 rounded-full animate-ping opacity-30" style="background:${meta.color}; animation-duration: 2s;"></div>` : ""}
            <div class="absolute inset-0 rounded-full border-2 bg-white/95 shadow-md flex items-center justify-center transition-all duration-200 group-hover:scale-115" style="border-color:${meta.color};">
              ${getCategorySVG(report.category, meta.color)}
            </div>
            <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex items-center justify-center" style="background-color: ${getSeverityColor(report.severity)};"></div>
          `;
        }

        el.innerHTML = `
          <div class="marker-3d-glow" style="color: ${meta.color}"></div>
          <div class="marker-3d-shadow"></div>
          <div class="marker-3d-tether" style="color: ${meta.color}"></div>
          <div class="marker-3d-billboard relative flex items-center justify-center" style="width: 100%; height: 100%;">
            ${innerHTML}
          </div>
        `;

        const icon = L.divIcon({
          html: el,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        try {
          const marker = L.marker([lat, lng], { icon }).addTo(map);

          // Click interaction
          marker.on("click", () => {
            try {
              popupRef.current?.remove();
              const popup = L.popup({ maxWidth: 280, className: "custom-leaflet-popup" })
                .setLatLng([lat, lng])
                .setContent(renderPopupHTML(report));
              popup.addTo(map);
              popupRef.current = popup;
            } catch (e) {
              // Safe skip
            }

            if (onSelectMarker) {
              onSelectMarker(report.id);
            }
          });

          markersRef.current.push(marker);
        } catch (e) {
          // Safe skip
        }
      }
    }
  }, [map, focusId, hoverId, layerMode, onSelectMarker, features]);

  // Handle flying & opening popups on programmatic focus changes (buttery smooth physics)
  useEffect(() => {
    if (!map || !focusId) return;

    const focusedReport = reports.find((r) => r.id === focusId);
    if (!focusedReport) return;

    const lat = focusedReport.location.lat;
    const lng = focusedReport.location.lng;

    let timer: NodeJS.Timeout;
    try {
      // Fly to position with extremely smooth, custom decelerating curves (zippy performance!)
      map.flyTo([lat, lng], 15.5, { 
        animate: true,
        duration: 0.5, 
        easeLinearity: 0.20
      });

      // Open popup right as flight finishes (snappy transition!)
      timer = setTimeout(() => {
        try {
          popupRef.current?.remove();
          const popup = L.popup({ maxWidth: 280 })
            .setLatLng([lat, lng])
            .setContent(renderPopupHTML(focusedReport));
          popup.addTo(map);
          popupRef.current = popup;
        } catch (e) {
          // Safe fail
        }
      }, 520); // Balanced to match the fast 0.5s duration
    } catch (e) {
      // Safe skip
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [focusId, reports, map]);

  // Load supercluster and manage event bindings safely
  useEffect(() => {
    if (!map) return;

    const cluster = new Supercluster({ radius: 55, maxZoom: 16 });
    cluster.load(features);
    clusterRef.current = cluster;

    updateMarkers();

    // If initial load with no active focus, fit bounds nicely
    if (features.length > 0 && !focusId) {
      try {
        const bounds = L.latLngBounds(
          features.map(
            (f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number],
          ),
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14.5 });
      } catch (e) {
        // Safe fail
      }
    }

    const onMoveEnd = () => {
      updateMarkers();
    };

    map.on("moveend", onMoveEnd);

    return () => {
      try {
        map.off("moveend", onMoveEnd);
      } catch (e) {
        // Safe skip
      }
      for (const m of markersRef.current) {
        try {
          m.remove();
        } catch (e) {
          // Safe skip
        }
      }
      markersRef.current = [];
      
      if (popupRef.current) {
        try {
          popupRef.current.remove();
        } catch (e) {
          // Safe skip
        }
      }
    };
  }, [features, focusId, map, updateMarkers]);

  return null;
}

/* ------------------------------------------------------------------
   Main Component: ReportMap
   ------------------------------------------------------------------ */
export function ReportMap({
  reports,
  center,
  zoom,
  focusId,
  hoverId,
  onSelectMarker,
  minSeverity = 1,
  setMinSeverity,
  activeStatuses = ["open", "dispatched", "in_progress", "closed"],
  setActiveStatuses,
  selectedCategory = null,
  setSelectedCategory,
  isFullscreen = false,
}: ReportMapProps) {
  // --- Settings UI States ---
  const [mapTheme, setMapTheme] = useState<"dark" | "light" | "satellite">("dark");
  const [layerMode, setLayerMode] = useState<"dispersal" | "concentration" | "photo">("dispersal");
  const [is3D, setIs3D] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Active tile layer setup
  const tileConfig = useMemo(() => {
    switch (mapTheme) {
      case "light":
        return {
          url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        };
      case "satellite":
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: "&copy; Esri &mdash; Satellite Imagery Base Map",
        };
      case "dark":
      default:
        return {
          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        };
    }
  }, [mapTheme]);

  // Toggle dynamic status filters
  const handleToggleStatus = (status: ReportStatus) => {
    if (!setActiveStatuses) return;
    if (activeStatuses.includes(status)) {
      // Keep at least one checked
      if (activeStatuses.length > 1) {
        setActiveStatuses(activeStatuses.filter((s) => s !== status));
      }
    } else {
      setActiveStatuses([...activeStatuses, status]);
    }
  };

  return (
    <div
      role="application"
      aria-label="Map showing infrastructure reports"
      className={
        isFullscreen
          ? "h-full w-full relative overflow-hidden bg-zinc-950"
          : "h-[450px] w-full lg:h-[550px] relative rounded-2xl overflow-hidden border border-zinc-200 shadow-md group/map bg-zinc-950"
      }
    >
      <MapContainer
        center={[center[1], center[0]]}
        zoom={zoom}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        zoomSnap={0.25}
        zoomDelta={0.25}
        wheelPxPerZoomLevel={150}
      >
        {/* key={mapTheme} forces react-leaflet to recreate TileLayer when URL changes */}
        <TileLayer key={mapTheme} url={tileConfig.url} attribution={tileConfig.attribution} />
        <MapController 
          reports={reports} 
          focusId={focusId} 
          hoverId={hoverId}
          onSelectMarker={onSelectMarker}
          layerMode={layerMode}
          is3D={is3D}
        />
      </MapContainer>

      {/* --- Aesthetic Map Vignette Border Overlay --- */}
      <div 
        className={`absolute inset-0 pointer-events-none z-10 shadow-[inset_0_2px_12px_rgba(0,0,0,0.15)] ${
          isFullscreen ? "rounded-none border-none" : "border border-black/10 rounded-2xl"
        }`}
      />

      {/* --- FreightGhost Cyberpunk Grid Overlay --- */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-[0.04] transition-opacity duration-500 group-hover/map:opacity-[0.06]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
          backgroundSize: '45px 45px'
        }}
      />

      {/* --- FLOATING MAP SETTINGS PANEL --- */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950/80 backdrop-blur-md border border-white/10 text-white shadow-xl hover:bg-zinc-900 transition-all pointer-events-auto"
          title="Map Controls"
        >
          <Settings className={`h-5 w-5 transition-transform duration-500 ${isPanelOpen ? 'rotate-90' : ''}`} />
        </button>

        {isPanelOpen && (
          <div className="w-[280px] rounded-2xl bg-zinc-950/85 backdrop-blur-xl border border-white/10 p-5 text-white shadow-2xl animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-auto flex flex-col gap-4 font-sans max-h-[400px] overflow-y-auto">
            {/* Tile Layer Styles */}
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                <MapIcon className="h-3 w-3" />
                Map Theme
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5">
                {(["dark", "light", "satellite"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMapTheme(t)}
                    className={`rounded-md py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                      mapTheme === t
                        ? "bg-white/15 text-white border border-white/5 shadow-inner"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.02]"
                    }`}
                  >
                    {t === "dark" ? "Dark" : t === "light" ? "Light" : "Sat"}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D Perspective Toggler */}
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-cyan-400 fill-cyan-400" />
                  3D Perspective
                </span>
                <button
                  onClick={() => setIs3D(!is3D)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    is3D ? "bg-cyan-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      is3D ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Marker Display modes */}
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                <Layers className="h-3 w-3" />
                Visual Layers
              </div>
              <div className="flex flex-col gap-1">
                {(["dispersal", "concentration", "photo"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setLayerMode(m)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ${
                      layerMode === m
                        ? "bg-white/10 text-white font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                    }`}
                  >
                    <span className="capitalize flex items-center gap-2">
                      {m === "dispersal" && <Sliders className="h-3.5 w-3.5" />}
                      {m === "concentration" && <Flame className="h-3.5 w-3.5 text-pink-400 animate-pulse" />}
                      {m === "photo" && <Camera className="h-3.5 w-3.5 text-cyan-400" />}
                      {m}
                    </span>
                    <ChevronRight className={`h-3 w-3 transition-transform ${layerMode === m ? 'rotate-90 text-white' : 'text-zinc-600'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Filters */}
            <div className="border-t border-white/10 pt-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  <Sliders className="h-3 w-3" />
                  Quick Filters
                </div>
                {/* Reset button if active */}
                {(minSeverity > 1 || activeStatuses.length < 4 || selectedCategory) && (
                  <button
                    onClick={() => {
                      if (setMinSeverity) setMinSeverity(1);
                      if (setActiveStatuses) setActiveStatuses(["open", "dispatched", "in_progress", "closed"]);
                      if (setSelectedCategory) setSelectedCategory(null);
                    }}
                    className="text-[9px] text-zinc-400 hover:text-white flex items-center gap-1 leading-none font-mono"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Reset
                  </button>
                )}
              </div>

              {/* Min Severity Slider */}
              {setMinSeverity && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span>Severity threshold</span>
                    <span className="font-mono text-amber-400 font-bold flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {minSeverity}+
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={minSeverity}
                    onChange={(e) => setMinSeverity(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white border border-white/5"
                  />
                </div>
              )}

              {/* Status checkboxes */}
              {setActiveStatuses && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-300">Active status types</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["open", "dispatched", "in_progress", "closed"] as const).map((s) => {
                      const isChecked = activeStatuses.includes(s);
                      const displayNames: Record<string, string> = {
                        open: "Open",
                        dispatched: "Dispatched",
                        in_progress: "In Progress",
                        closed: "Resolved",
                      };
                      return (
                        <button
                          key={s}
                          onClick={() => handleToggleStatus(s)}
                          className={`rounded px-2 py-1 text-[10px] text-left border flex items-center gap-1.5 transition-all ${
                            isChecked
                              ? "bg-white/10 border-white/20 text-white font-medium shadow-inner"
                              : "bg-transparent border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-white' : 'bg-zinc-700'}`}></span>
                          {displayNames[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Bottom-left HUD stats overlay --- */}
      <div className="absolute bottom-4 left-4 z-10 rounded-full bg-zinc-950/80 backdrop-blur-md border border-white/10 px-4 py-2 text-[11px] font-mono tracking-wider text-white shadow-xl flex items-center gap-2 select-none">
        <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse"></span>
        <span className="font-bold text-zinc-300">Live Intake Feed:</span>
        <span className="font-bold text-white">{reports.length} Reports mapped</span>
      </div>
    </div>
  );
}

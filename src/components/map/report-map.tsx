"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { HeatmapLayer, HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import {
  Flame,
  Hexagon,
  Map as MapIcon,
  MapPin,
  Mountain,
  RotateCcw,
  Settings,
  Sliders,
  Star,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  type MapRef,
  Popup,
  useControl,
} from "react-map-gl/maplibre";
import { renderPopupHTML } from "@/components/map/map-popup";
import { SATELLITE_STYLE } from "@/components/map/satellite-style";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";
import type { DashboardReport } from "@/lib/dashboard-data";
import { STATUS_LABEL } from "@/lib/status";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { useCurrency } from "@/lib/use-currency";

export type MapTheme = "dark" | "light" | "satellite";

interface ReportMapProps {
  reports: DashboardReport[];
  center: [number, number]; // [lng, lat]
  zoom: number;
  focusId?: string | null;
  onSelectMarker?: (id: string) => void;
  minSeverity?: number;
  setMinSeverity?: (s: number) => void;
  activeStatuses?: ReportStatus[];
  setActiveStatuses?: (s: ReportStatus[]) => void;
  selectedCategory?: ReportCategory | null;
  setSelectedCategory?: (c: ReportCategory | null) => void;
  isFullscreen?: boolean;
  // Optional controlled mapTheme — pass these to lift theme state to a parent
  // so other UI (e.g. Dispatch panel) can react. Falls back to local state.
  mapTheme?: MapTheme;
  onMapThemeChange?: (t: MapTheme) => void;
}

/* ------------------------------------------------------------------
   Basemap styles — Carto vector (dark/light) + ArcGIS raster (satellite).
   The satellite raster lives in ./satellite-style (shared with the landing
   hero map) so its Esri maxzoom cap stays in one place.
   ------------------------------------------------------------------ */
const STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const STYLE_LIGHT =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function statusColor(
  status: ReportStatus,
  severity: number,
): [number, number, number] {
  if (status === "closed") return [48, 209, 88];
  if (status === "dispatched") return [10, 132, 255];
  if (status === "in_progress") return [90, 200, 250];
  if (severity >= 4) return [255, 69, 58];
  return [255, 159, 10];
}

/* ------------------------------------------------------------------
   DeckGL overlay glued onto the Maplibre map via useControl
   ------------------------------------------------------------------ */
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

/* ------------------------------------------------------------------
   ReportMap
   ------------------------------------------------------------------ */
function ReportMapInner({
  reports,
  center,
  zoom,
  focusId,
  onSelectMarker,
  minSeverity = 1,
  setMinSeverity,
  activeStatuses = ["open", "dispatched", "in_progress", "closed"],
  setActiveStatuses,
  selectedCategory = null,
  setSelectedCategory,
  isFullscreen = false,
  mapTheme: mapThemeProp,
  onMapThemeChange,
}: ReportMapProps) {
  const currency = useCurrency();
  const mapRef = useRef<MapRef | null>(null);
  const [mapThemeLocal, setMapThemeLocal] = useState<MapTheme>("dark");
  const mapTheme = mapThemeProp ?? mapThemeLocal;
  const setMapTheme = (t: MapTheme) => {
    if (onMapThemeChange) onMapThemeChange(t);
    else setMapThemeLocal(t);
  };
  const [is3D, setIs3D] = useState(true);
  const [viewMode, setViewMode] = useState<"markers" | "hex" | "heatmap">(
    "markers",
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Panel exit choreography: closing flips `panelLeaving` to play the slide-out,
  // then unmounts after the 150ms animation. The gear icon stays tied to the
  // logical open state below so it rotates back in sync with the panel exit.
  const [panelLeaving, setPanelLeaving] = useState(false);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePanel = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsPanelOpen(false);
      return;
    }
    setPanelLeaving(true);
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    panelTimerRef.current = setTimeout(() => {
      setIsPanelOpen(false);
      setPanelLeaving(false);
    }, 150);
  };
  const togglePanel = () => {
    if (isPanelOpen) closePanel();
    else setIsPanelOpen(true);
  };
  useEffect(
    () => () => {
      if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    },
    [],
  );
  const [popupReport, setPopupReport] = useState<DashboardReport | null>(null);

  const mapStyle =
    mapTheme === "dark"
      ? STYLE_DARK
      : mapTheme === "light"
        ? STYLE_LIGHT
        : SATELLITE_STYLE;

  const lastFlownIdRef = useRef<string | null>(null);

  // Held in a ref so the layers useMemo doesn't rebuild (and re-upload GPU
  // buffers) when a caller passes onSelectMarker as an inline callback.
  const onSelectMarkerRef = useRef(onSelectMarker);
  useEffect(() => {
    onSelectMarkerRef.current = onSelectMarker;
  }, [onSelectMarker]);

  // Fly to focused report — only when focusId actually changes.
  // reports must stay in deps so we can look up coords after filter mutations,
  // but the lastFlownIdRef guard prevents re-flying for the same selection.
  useEffect(() => {
    if (!focusId) {
      lastFlownIdRef.current = null;
      setPopupReport(null);
      return;
    }
    const focused = reports.find((r) => r.id === focusId);
    if (!focused) return;
    if (lastFlownIdRef.current === focusId) {
      setPopupReport(focused);
      return;
    }
    lastFlownIdRef.current = focusId;
    const m = mapRef.current?.getMap();
    if (m) {
      m.flyTo({
        center: [focused.location.lng, focused.location.lat],
        zoom: Math.max(zoom, 15),
        speed: 0.85,
        curve: 1.6,
        pitch: is3D ? 45 : 0,
        bearing: is3D ? -20 : 0,
        essential: true,
        easing: (t) => 1 - (1 - t) ** 3,
      });
    }
    setPopupReport(focused);
  }, [focusId, reports, zoom, is3D]);

  // Clear marker popup when leaving marker view — stale popup from previous
  // mode would float over the aggregation layer with no anchored point.
  useEffect(() => {
    if (viewMode !== "markers") setPopupReport(null);
  }, [viewMode]);

  // Toggle pitch when 3D switched
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    m.easeTo({
      pitch: is3D ? 45 : 0,
      bearing: is3D ? -20 : 0,
      duration: 800,
    });
  }, [is3D]);

  const handleToggleStatus = (status: ReportStatus) => {
    if (!setActiveStatuses) return;
    if (activeStatuses.includes(status)) {
      if (activeStatuses.length > 1) {
        setActiveStatuses(activeStatuses.filter((s) => s !== status));
      }
    } else {
      setActiveStatuses([...activeStatuses, status]);
    }
  };

  // Halo layer depends only on focusId + reports — separated so a focus change
  // doesn't rebuild the glow/dots layers (GPU buffer re-upload) unnecessarily.
  const haloLayer = useMemo(() => {
    if (viewMode !== "markers") return null;
    const highlighted = focusId ? reports.find((r) => r.id === focusId) : null;
    if (!highlighted) return null;
    return new ScatterplotLayer<DashboardReport>({
      id: "report-halo",
      data: [highlighted],
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      pickable: false,
      stroked: true,
      filled: false,
      radiusUnits: "meters",
      radiusMinPixels: 18,
      radiusMaxPixels: 80,
      lineWidthMinPixels: 2,
      getPosition: (r) => [r.location.lng, r.location.lat],
      getRadius: 180,
      getLineColor: () => {
        const [cr, cg, cb] = statusColor(
          highlighted.status,
          highlighted.severity,
        );
        return [cr, cg, cb, 200];
      },
    });
  }, [focusId, reports, viewMode]);

  const layers = useMemo(() => {
    // ---- Aggregation views (choropleth-style spatial distribution) ----
    // Hex bins: deck.gl bins points into hexagons, colors by count, optionally
    // extrudes 3D bars when pitched. True "choropleth from points".
    if (viewMode === "hex") {
      const hex = new HexagonLayer<DashboardReport>({
        id: "report-hex",
        data: reports,
        pickable: true,
        extruded: is3D,
        radius: 180, // hex radius in meters; tuned for neighborhood-scale bins
        elevationScale: is3D ? 12 : 0,
        getPosition: (r) => [r.location.lng, r.location.lat],
        // Viridis-ish ramp: low=cool blue, high=hot magenta. Reads as severity-of-density.
        colorRange: [
          [10, 132, 255, 140],
          [90, 200, 250, 180],
          [191, 90, 242, 210],
          [255, 159, 10, 230],
          [255, 69, 58, 245],
          [255, 215, 0, 255],
        ],
        coverage: 0.9,
        opacity: 0.78,
        material: false, // skip lighting calc — saves a uniform pass
        updateTriggers: { extruded: [is3D], elevationScale: [is3D] },
      });
      return [hex];
    }

    if (viewMode === "heatmap") {
      const heat = new HeatmapLayer<DashboardReport>({
        id: "report-heat",
        data: reports,
        pickable: false,
        getPosition: (r) => [r.location.lng, r.location.lat],
        // weight by severity — a 5-star pothole heats more than a 1-star scuff
        getWeight: (r) => r.severity,
        // Larger kernel so nearby reports merge into regional hotspots instead
        // of reading as isolated dots. radiusPixels is screen-space so it stays
        // visually consistent across zooms.
        radiusPixels: 110,
        // Lower intensity counterbalances larger radius — keeps the peak from
        // saturating to white when many reports cluster.
        intensity: 1,
        // Lower threshold lets faint edges fade out gradually instead of
        // hard-clipping; ~98% of the kernel is now visible vs 96%.
        threshold: 0.02,
        // Bigger weights texture = smoother gradients, less blocky transitions.
        weightsTextureSize: 1024,
        // matched palette w/ hex layer so the two views feel like one family
        colorRange: [
          [10, 132, 255, 0],
          [10, 132, 255, 100],
          [90, 200, 250, 160],
          [191, 90, 242, 200],
          [255, 159, 10, 225],
          [255, 69, 58, 245],
        ],
      });
      return [heat];
    }

    // ---- Marker view (default) ----
    // Outer soft glow ring — translucent, larger
    const glow = new ScatterplotLayer<DashboardReport>({
      id: "report-glow",
      data: reports,
      // Flat ground-plane overlay. In interleaved mode deck shares maplibre's
      // depth buffer, so markers at z=0 z-fight the basemap and flicker against
      // it during zoom ("color twitches with the background"). depthCompare:
      // 'always' draws them unconditionally on top; depthWriteEnabled:false keeps
      // them out of the shared depth buffer so the 3 stacked translucent marker
      // layers don't z-fight each other either.
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      pickable: false,
      stroked: false,
      filled: true,
      radiusUnits: "meters",
      radiusMinPixels: 10,
      radiusMaxPixels: 42,
      getPosition: (r) => [r.location.lng, r.location.lat],
      // Demo report gets a fatter glow so the blue halo reads from across the map.
      getRadius: (r) => (r.demo ? 220 + r.severity * 60 : 90 + r.severity * 40),
      getFillColor: (r) => {
        if (r.demo) return [10, 132, 255, r.id === focusId ? 120 : 90];
        const [cr, cg, cb] = statusColor(r.status, r.severity);
        return [cr, cg, cb, r.id === focusId ? 70 : 38];
      },
      updateTriggers: { getFillColor: [focusId] },
    });

    // Inner crisp dot — neon core w/ outline
    const dots = new ScatterplotLayer<DashboardReport>({
      id: "report-dots",
      data: reports,
      // Same depth-overlay treatment as the glow — see report-glow above.
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "meters",
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      lineWidthMinPixels: 1.5,
      lineWidthUnits: "pixels",
      getPosition: (r) => [r.location.lng, r.location.lat],
      // Demo report gets a noticeably larger core dot to draw the eye.
      getRadius: (r) => (r.demo ? 70 + r.severity * 22 : 28 + r.severity * 14),
      getFillColor: (r) => {
        if (r.demo) return [10, 132, 255, 255];
        const [cr, cg, cb] = statusColor(r.status, r.severity);
        return [cr, cg, cb, r.id === focusId ? 255 : 230];
      },
      getLineColor: (r) => {
        // Bright blue halo outline marks the demo report regardless of focus.
        if (r.demo) return [10, 132, 255, 255];
        const [cr, cg, cb] = statusColor(r.status, r.severity);
        return r.id === focusId ? [255, 255, 255, 255] : [cr, cg, cb, 255];
      },
      getLineWidth: (r) => (r.demo ? 4 : r.id === focusId ? 3 : 1.5),
      // autoHighlight OFF — per-frame ReadPixels caused GPU stalls on lower-end GPUs.
      updateTriggers: {
        getFillColor: [focusId],
        getLineColor: [focusId],
        getLineWidth: [focusId],
      },
      onClick: ({ object }) => {
        if (object) {
          onSelectMarkerRef.current?.(object.id);
          setPopupReport(object);
        }
      },
    });

    // Halo is built in a separate useMemo (haloLayer); including it here would
    // force an extra array allocation on focusId change but the glow/dots layers
    // still need focusId in deps so deck.gl sees fresh updateTrigger values.
    return [glow, dots];
  }, [reports, focusId, viewMode, is3D]);

  // Combine base layers with the separately-memoized halo.
  const allLayers = useMemo(
    () => (haloLayer ? [...layers, haloLayer] : layers),
    [layers, haloLayer],
  );

  const containerClass = isFullscreen
    ? "h-full w-full relative overflow-hidden bg-[#050505]"
    : "h-[300px] w-full sm:h-[450px] lg:h-[550px] relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#050505]";

  return (
    <div
      role="application"
      aria-label="Map showing infrastructure reports"
      className={containerClass}
    >
      <MapLibreMap
        ref={mapRef}
        initialViewState={{
          longitude: center[0],
          latitude: center[1],
          zoom,
          pitch: 45,
          bearing: -20,
        }}
        mapStyle={mapStyle}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        // Smoothness levers ---------------------------------------------------
        // reuseMaps: keep GL context alive when component remounts (e.g. theme
        //   swap, route transition) — avoids re-init cost.
        // maxTileCacheSize: bigger in-memory tile cache so panning back doesn't
        //   re-download; cheap on RAM, huge on perceived smoothness.
        // refreshExpiredTiles=false: stops periodic stale-checks on long
        //   sessions. We're not consuming live imagery.
        // fadeDuration: cuts label cross-fade time on zoom changes.
        // localIdeographFontFamily: avoids fetching CJK glyph PBFs (we don't
        //   render Asian-script labels for Cumming, GA).
        reuseMaps
        maxTileCacheSize={1000}
        refreshExpiredTiles={false}
        fadeDuration={150}
        localIdeographFontFamily="sans-serif"
      >
        {/* interleaved=true shares maplibre's WebGL context (single GPU canvas),
            avoiding a second compositor layer + second WebGL context. */}
        <DeckGLOverlay layers={allLayers} interleaved={true} />
        {popupReport && (
          <Popup
            longitude={popupReport.location.lng}
            latitude={popupReport.location.lat}
            offset={20}
            closeOnClick={false}
            onClose={() => setPopupReport(null)}
            maxWidth="min(300px, 90vw)"
          >
            {/* renderPopupHTML escapes all user-controlled fields via esc(); CATEGORY_META is a static constant. Do NOT pass un-sanitized strings here. */}
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is built by renderPopupHTML, which esc()-escapes every user-controlled field; inputs are a trusted static CATEGORY_META + escaped report fields.
              dangerouslySetInnerHTML={{
                __html: renderPopupHTML(popupReport, currency),
              }}
            />
          </Popup>
        )}
      </MapLibreMap>

      <style>{`
        @keyframes rmPanelIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rmPanelOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}
        @media (prefers-reduced-motion:reduce){.rm-controls *{animation:none!important}}
      `}</style>
      {/* Floating settings — top-16 (not top-4) to clear the fixed global header on /city/[slug]/map. */}
      <div className="rm-controls absolute top-16 right-4 z-20 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={togglePanel}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1c1c1e] border border-white/[0.08] text-white hover:border-white/[0.2] transition-colors pointer-events-auto"
          title="Map Controls"
          aria-label="Toggle map controls"
        >
          <Settings
            className={`h-4 w-4 transition-transform duration-300 ${
              isPanelOpen ? "rotate-45" : ""
            }`}
            strokeWidth={1.75}
          />
        </button>

        {isPanelOpen && (
          <LiquidGlassCard
            className="w-[min(280px,calc(100vw-2rem))] pointer-events-auto"
            style={{
              animation: panelLeaving
                ? "rmPanelOut 150ms cubic-bezier(0.4,0,1,1) forwards"
                : "rmPanelIn 200ms cubic-bezier(0.16,1,0.3,1)",
            }}
            contentClassName="bg-black/45 p-4 text-white flex flex-col gap-4 max-h-[420px] overflow-y-auto custom-scrollbar"
            borderRadius="16px"
            blurIntensity="xl"
            shadowIntensity="xs"
            glowIntensity="xs"
          >
            {/* View mode — markers vs choropleth aggregations */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-2">
                <Sliders className="h-3 w-3 text-zinc-300" />
                View
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
                {(
                  [
                    { key: "markers", label: "Markers", Icon: MapPin },
                    { key: "hex", label: "Hex bins", Icon: Hexagon },
                    { key: "heatmap", label: "Heatmap", Icon: Flame },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setViewMode(key)}
                    className={`rounded-md py-3 text-[11px] flex items-center justify-center gap-1 transition-all duration-200 min-h-[44px] lg:py-1.5 lg:min-h-0 ${
                      viewMode === key
                        ? "bg-electric-indigo/20 text-white"
                        : "text-zinc-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-3 w-3" strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>
              {viewMode !== "markers" && (
                <p className="text-[10.5px] text-zinc-500 mt-1.5 leading-tight">
                  {viewMode === "hex"
                    ? "Reports binned into hexagons, colored by count. Try 3D tilt."
                    : "Density gradient weighted by severity."}
                </p>
              )}
            </div>

            {/* Map theme */}
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-2">
                <MapIcon className="h-3 w-3 text-zinc-300" />
                Basemap
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
                {(["dark", "light", "satellite"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setMapTheme(t)}
                    className={`rounded-md py-3 text-xs capitalize transition-all min-h-[44px] lg:py-1.5 lg:min-h-0 ${
                      mapTheme === t
                        ? "bg-electric-indigo/20 text-white"
                        : "text-zinc-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t === "satellite" ? "Satellite" : t}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D toggle */}
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center justify-between text-xs text-zinc-300 min-h-[44px] lg:min-h-0">
                <span className="flex items-center gap-1.5">
                  <Mountain
                    className="h-3.5 w-3.5 text-zinc-300"
                    strokeWidth={1.75}
                  />
                  3D tilt
                </span>
                {/* Outer wrapper provides the 44px tap target on mobile; the visual
                    switch itself stays h-5 w-9. lg: removes the extra hit area. */}
                <span className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -mr-1 lg:min-h-0 lg:min-w-0 lg:mr-0">
                  <button
                    type="button"
                    onClick={() => setIs3D(!is3D)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                      is3D ? "bg-electric-indigo" : "bg-white/10"
                    }`}
                    aria-label="Toggle 3D tilt"
                    aria-pressed={is3D}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        is3D ? "translate-x-4" : "translate-x-1"
                      } translate-y-[3px]`}
                    />
                  </button>
                </span>
              </div>
            </div>

            {/* Filters — hidden in fullscreen (duplicates left-side Dispatch panel) */}
            {!isFullscreen && (
              <div className="border-t border-white/5 pt-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <Sliders className="h-3 w-3 text-zinc-300" />
                    Filters
                  </div>
                  {(minSeverity > 1 ||
                    activeStatuses.length < 4 ||
                    selectedCategory) && (
                    <button
                      type="button"
                      onClick={() => {
                        setMinSeverity?.(1);
                        setActiveStatuses?.([
                          "open",
                          "dispatched",
                          "in_progress",
                          "closed",
                        ]);
                        setSelectedCategory?.(null);
                      }}
                      className="text-xs text-zinc-300 hover:text-white flex items-center gap-1 min-h-[44px] px-2 lg:min-h-0 lg:px-0"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  )}
                </div>

                {setMinSeverity && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Min severity</span>
                      <span className="text-amber-pulse flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-pulse text-amber-pulse" />
                        {minSeverity}+
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={minSeverity}
                      onChange={(e) =>
                        setMinSeverity(Number.parseInt(e.target.value, 10))
                      }
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-electric-indigo"
                    />
                  </div>
                )}

                {setActiveStatuses && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-300">Status</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        ["open", "dispatched", "in_progress", "closed"] as const
                      ).map((s) => {
                        const isChecked = activeStatuses.includes(s);
                        return (
                          <button
                            type="button"
                            key={s}
                            onClick={() => handleToggleStatus(s)}
                            aria-pressed={isChecked}
                            className={`rounded px-2 py-3 text-xs text-left border flex items-center gap-1.5 transition-all min-h-[44px] lg:py-1 lg:min-h-0 ${
                              isChecked
                                ? "bg-white/10 border-white/15 text-white"
                                : "bg-transparent border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isChecked ? "bg-electric-indigo" : "bg-zinc-700"
                              }`}
                            />
                            {STATUS_LABEL[s]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </LiquidGlassCard>
        )}
      </div>

      {/* HUD: report count */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-4 z-20 rounded-full bg-[#1c1c1e] border border-white/[0.08] px-3 py-1.5 text-[13px] text-zinc-300 flex items-center gap-1.5 select-none pointer-events-none">
        <span className="text-white tabular-nums font-medium">
          {reports.length}
        </span>
        <span className="text-zinc-500">reports</span>
      </div>

      {/* Legend — content depends on view mode */}
      <LiquidGlassCard
        className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-4 z-20 pointer-events-none"
        contentClassName={`${
          mapTheme === "light" ? "bg-black/45" : "bg-black/5"
        } px-3 py-2.5 text-[12px] text-zinc-200 flex flex-col gap-1.5 rounded-[14px]`}
        borderRadius="14px"
        blurIntensity="xl"
        shadowIntensity="none"
        glowIntensity="xs"
      >
        {viewMode === "markers" ? (
          // Legend mixes status colours (Dispatched/Resolved/In progress) with a
          // severity override (Critical = severity ≥4, open). Grouping them under
          // labelled sections makes the distinction audible to screen readers and
          // removes the visual-colour-only information barrier.
          // biome-ignore lint/a11y/useSemanticElements: role="list" intentional — <ul> applies UA list-style/margin/padding and disallows the interleaved sr-only <p> section labels; flex/gap layout is custom
          <div role="list" aria-label="Map marker legend">
            {/* Status group */}
            <p className="sr-only">Status</p>
            {/* biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling */}
            <div role="listitem" className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]"
              />
              Dispatched
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling */}
            <div role="listitem" className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#30d158]"
              />
              Resolved
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling */}
            <div role="listitem" className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a]"
              />
              In progress
            </div>
            {/* Severity override — open reports with severity ≥4 render red
                regardless of status; separate label prevents confusion with
                a "Critical" status that does not exist in the data model. */}
            <p className="sr-only">Severity</p>
            {/* biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling */}
            <div role="listitem" className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-[#ff453a]"
              />
              Critical (sev 4–5)
            </div>
          </div>
        ) : (
          <>
            <div className="text-[10.5px] uppercase tracking-wider text-zinc-400 mb-0.5">
              {viewMode === "hex" ? "Reports per hex" : "Density"}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-20 rounded-sm bg-gradient-to-r from-[#0a84ff] via-[#bf5af2] via-[#ff9f0a] to-[#ffd700]" />
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-zinc-400 -mt-0.5">
              <span>Low</span>
              <span>High</span>
            </div>
          </>
        )}
      </LiquidGlassCard>
    </div>
  );
}

// memo prevents re-render when parent re-renders with identical props.
// Critical here because parent state (filters, focus) cascades into ReportMap
// re-evaluation which triggers DeckGLOverlay setProps + layer rebuilds.
export const ReportMap = memo(ReportMapInner);

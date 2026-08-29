"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import {
  Check,
  Flame,
  Globe,
  Map as MapIcon,
  MapPin,
  Mountain,
  Palette,
  RotateCcw,
  Settings,
  Sliders,
  Star,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  type MapRef,
  Popup,
  useControl,
} from "react-map-gl/maplibre";
import { renderPopupHTML } from "@/components/map/map-popup";
import {
  type MarkerColorMode,
  PROGRESS_LEGEND,
  pinColorRGB,
  pinIconFor,
  teamLegend,
  URGENCY_LEGEND,
} from "@/components/map/pin-icons";
import { SATELLITE_STYLE } from "@/components/map/satellite-style";
import {
  glassChrome,
  glassSheen,
  LiquidGlassCard,
} from "@/components/ui/liquid-glass";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  type Bounds,
  buildClusterIndex,
  type ClusterFeature,
  clusterExpansionZoom,
  clustersForView,
} from "@/lib/map/clustering";
import { STATUS_LABEL } from "@/lib/status";
import { useTheme } from "@/lib/theme";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { useCurrency } from "@/lib/use-currency";
import { DAY_MS } from "@/lib/utils/time-constants";

export type MapTheme = "dark" | "light" | "satellite";

/** Which renderer draws the basemap + pins. Globe is the default. */
export type MapRenderer = "globe" | "flat";

// Cesium is a multi-megabyte dependency; keeping the globe behind its own
// dynamic chunk means the flat-map fallback (and any route that never shows
// the globe) never downloads it.
const GlobeMapLazy = dynamic(
  () => import("@/components/map/globe-map").then((m) => m.GlobeMap),
  { ssr: false },
);

// Below this many visible reports the map draws every pin (demo/pilot size);
// above it, supercluster aggregates to keep the IconLayer from choking.
const CLUSTER_THRESHOLD = 500;

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
  // Optional controlled marker color mode — same lift-to-parent pattern as
  // mapTheme. Falls back to local state ("progress").
  colorMode?: MarkerColorMode;
  onColorModeChange?: (m: MarkerColorMode) => void;
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

// Marker colors now live in ./pin-icons (pinIconFor / pinColorRGB / the legend
// metadata) so the pins, the focus halo, and the legend all read from one
// source and can't drift. The old statusColor() helper — which hard-coded the
// map/legend palette here — was removed with the ScatterplotLayer dot markers.

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
  colorMode: colorModeProp,
  onColorModeChange,
}: ReportMapProps) {
  const currency = useCurrency();
  const { theme: appTheme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [mapThemeLocal, setMapThemeLocal] = useState<MapTheme>("dark");
  const mapTheme = mapThemeProp ?? mapThemeLocal;
  const setMapTheme = (t: MapTheme) => {
    if (onMapThemeChange) onMapThemeChange(t);
    else setMapThemeLocal(t);
  };
  // Uncontrolled maps follow the app's light/dark theme so the basemap matches
  // the surrounding UI. `satellite` is a deliberate user override, so it's left
  // untouched until the user picks another basemap. When a parent lifts the
  // theme (mapThemeProp set), it owns this sync instead — we no-op here.
  useEffect(() => {
    if (mapThemeProp !== undefined) return;
    setMapThemeLocal((cur) => (cur === "satellite" ? cur : appTheme));
  }, [appTheme, mapThemeProp]);
  const [is3D, setIs3D] = useState(true);
  const [viewMode, setViewMode] = useState<"markers" | "heatmap">("markers");
  // Renderer: the MapLibre/deck.gl map by default, the Cesium globe opt-in via
  // the gear panel. The globe costs 8.7 MB over 113 requests (1.7 MB
  // Cesium.js + ~1 MB local assets + ~3.9 MB of ion terrain/OSM-building
  // tiles) and ~10.5 s of main-thread blocking parsing b3dm tiles, against
  // 2.3 MB / 63 requests flat — too much to spend before the operator has
  // asked for 3D. It also cannot initialise under the production CSP today
  // (Cesium.js calls eval at load), so defaulting to it meant every prod
  // visitor paid a failed download before falling back here anyway.
  // Two things still force `flat` regardless of preference: the heatmap view
  // (a deck.gl aggregation layer with no globe equivalent) and a failed
  // Cesium/WebGL2 init (handleGlobeInitError below).
  const [renderer, setRenderer] = useState<MapRenderer>("flat");
  const globeFailedRef = useRef(false);
  const handleGlobeInitError = useCallback((reason: string) => {
    if (globeFailedRef.current) return;
    globeFailedRef.current = true;
    console.warn(
      `[ReportMap] Cesium globe failed to initialise (${reason}) — falling back to the MapLibre renderer.`,
    );
    setRenderer("flat");
  }, []);
  const useGlobe = renderer === "globe" && viewMode === "markers";
  // Marker color mode — controlled by a parent when colorModeProp is set,
  // otherwise local (mirrors the mapTheme controlled/uncontrolled pattern).
  const [colorModeLocal, setColorModeLocal] =
    useState<MarkerColorMode>("progress");
  const colorMode = colorModeProp ?? colorModeLocal;
  const setColorMode = (m: MarkerColorMode) => {
    if (onColorModeChange) onColorModeChange(m);
    else setColorModeLocal(m);
  };
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

  // Coarse clock tick (5 min) so the 24h completed-report cutoff below keeps
  // re-evaluating on a long-lived idle tab — with a stable `reports` reference
  // alone, the Date.now() captured on first evaluation would freeze and
  // expired reports would never drop off screen.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Reports actually painted on the map. A resolved report drops off 24h after
  // it was completed (or marked under fix) so the map shows the *live* backlog,
  // not a growing pile of green checks. Reports with no completion timestamp
  // (the synthetic corpus, or anything not yet timestamped) are always kept.
  // Feeds the markers, the heatmap aggregation, the report-count HUD, and
  // the focus flyTo/halo lookups below so the camera and ring never target a
  // report that has no pin on screen.
  const visibleReports = useMemo(() => {
    return reports.filter((r) => {
      if (r.status !== "closed") return true;
      const ts = r.completed_at ?? r.marked_under_fix_at;
      if (!ts) return true;
      const t = new Date(ts).getTime();
      if (Number.isNaN(t)) return true;
      return nowTick - t < DAY_MS;
    });
  }, [reports, nowTick]);

  // ── Marker clustering (LCP-17) ─────────────────────────────────────────────
  // Only engage above CLUSTER_THRESHOLD: at the demo corpus size the map draws
  // every pin exactly as before (zero behavior change), and clustering kicks in
  // only when the raw IconLayer would choke (agents.md: breaks past ~5k points).
  const clusteringActive =
    viewMode === "markers" && visibleReports.length > CLUSTER_THRESHOLD;

  // Live viewport, updated on moveEnd. Null until the map first reports bounds;
  // clustering falls back to no-op (all pins) until then.
  const [view, setView] = useState<{ bounds: Bounds; zoom: number } | null>(
    null,
  );

  // O(n) index build — memoized on the report set so pan/zoom reuse one index.
  const clusterIndex = useMemo(
    () => (clusteringActive ? buildClusterIndex(visibleReports) : null),
    [clusteringActive, visibleReports],
  );

  const clusterFeatures = useMemo<ClusterFeature[] | null>(() => {
    if (!clusterIndex || !view) return null;
    return clustersForView(clusterIndex, view.bounds, view.zoom);
  }, [clusterIndex, view]);

  const syncViewFromMap = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    const b = m.getBounds();
    setView({
      bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      zoom: m.getZoom(),
    });
  }, []);

  // Fly to focused report — only when focusId actually changes.
  // visibleReports must stay in deps so we can look up coords after filter
  // mutations, but the lastFlownIdRef guard prevents re-flying for the same
  // selection. Resolving from visibleReports (not raw reports) makes focusing
  // a 24h-expired closed report a no-op instead of flying the camera to a
  // spot with no pin (the Dispatch list has no age filter).
  useEffect(() => {
    if (!focusId) {
      lastFlownIdRef.current = null;
      setPopupReport(null);
      return;
    }
    const focused = visibleReports.find((r) => r.id === focusId);
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
  }, [focusId, visibleReports, zoom, is3D]);

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

  // Team legend swatches — only the teams actually present on the map, so the
  // legend never lists a department with zero visible pins. Memoized on the
  // same corpus the pins use so it stays in step with what's rendered.
  const [teamLegendExpanded, setTeamLegendExpanded] = useState(false);
  const teamLegendData = useMemo(
    () =>
      teamLegend(
        visibleReports,
        teamLegendExpanded ? Number.POSITIVE_INFINITY : undefined,
      ),
    [visibleReports, teamLegendExpanded],
  );

  // Halo layer depends only on focusId + visibleReports — separated so a focus
  // change doesn't rebuild the marker layers (GPU buffer re-upload)
  // unnecessarily. Resolving from visibleReports (same corpus as the pins)
  // means a focused-but-expired report gets no orphan ring.
  const haloLayer = useMemo(() => {
    if (viewMode !== "markers") return null;
    const highlighted = focusId
      ? visibleReports.find((r) => r.id === focusId)
      : null;
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
        const [cr, cg, cb] = pinColorRGB(highlighted, colorMode);
        return [cr, cg, cb, 200];
      },
    });
  }, [focusId, visibleReports, viewMode, colorMode]);

  const layers = useMemo(() => {
    // ---- Aggregation view (choropleth-style spatial distribution) ----
    if (viewMode === "heatmap") {
      const heat = new HeatmapLayer<DashboardReport>({
        id: "report-heat",
        data: visibleReports,
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
        // Single-hue intensity ramp — transparent -> muted amber #ad8434 ->
        // danger #cc4638 for hotspots. Replaces the old blue/purple/gold
        // rainbow; matched to the shared legend gradient swatch so density
        // reads as one enterprise-muted family.
        colorRange: [
          [173, 132, 52, 0],
          [173, 132, 52, 90],
          [186, 111, 47, 150],
          [196, 91, 46, 190],
          [204, 70, 56, 225],
          [204, 70, 56, 245],
        ],
      });
      return [heat];
    }

    // ---- Marker view (default) ----
    // Blue "live" glow beneath ONLY the demo report — preserves the presenter
    // affordance the old dots carried. Real reports no longer get a glow ring;
    // the teardrop pins carry their own tone-matched shadow.
    const demoGlow = new ScatterplotLayer<DashboardReport>({
      id: "report-demo-glow",
      data: visibleReports.filter((r) => r.demo),
      // Flat ground-plane overlay. In interleaved mode deck shares maplibre's
      // depth buffer, so markers at z=0 z-fight the basemap and flicker during
      // zoom ("color twitches with the background"). depthCompare:'always' draws
      // them unconditionally on top; depthWriteEnabled:false keeps them out of
      // the shared depth buffer so the glow + pins don't z-fight each other.
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      pickable: false,
      stroked: false,
      filled: true,
      radiusUnits: "meters",
      radiusMinPixels: 10,
      radiusMaxPixels: 60,
      getPosition: (r) => [r.location.lng, r.location.lat],
      getRadius: (r) => 220 + r.severity * 60,
      getFillColor: (r) => [10, 132, 255, r.id === focusId ? 120 : 90],
      updateTriggers: { getFillColor: [focusId] },
    });

    // Teardrop pin markers (hero-style — see ./pin-icons). getIcon returns a
    // cached SVG data-URL keyed by fill+border+glyph, so IconLayer auto-packs
    // a small atlas and only re-fetches when the color mode changes. Same
    // depth-overlay params as the demo glow above (see that comment).
    // When clustering, the IconLayer draws only the reports supercluster left
    // un-clustered at this zoom (the leaves); grouped points are drawn as
    // aggregate bubbles below. Below the threshold clusterFeatures is null and
    // every report renders, exactly as before.
    const leafIds = clusterFeatures
      ? new Set(
          clusterFeatures
            .filter((f) => f.kind === "leaf")
            .map((f) => (f.kind === "leaf" ? f.reportId : "")),
        )
      : null;
    const markerData = leafIds
      ? visibleReports.filter((r) => leafIds.has(r.id))
      : visibleReports;

    const markers = new IconLayer<DashboardReport>({
      id: "report-markers",
      data: markerData,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      pickable: true,
      billboard: true,
      sizeUnits: "pixels",
      sizeMinPixels: 17,
      sizeMaxPixels: 54,
      getPosition: (r) => [r.location.lng, r.location.lat],
      getIcon: (r) => pinIconFor(r, colorMode),
      // Mild severity ramp (~26 -> ~34); demo bumped, focused pin scaled up.
      getSize: (r) => {
        const base = 24 + r.severity * 2;
        const sized = r.demo ? base + 12 : base;
        return r.id === focusId ? sized * 1.28 : sized;
      },
      // autoHighlight OFF — per-frame ReadPixels caused GPU stalls on lower-end GPUs.
      updateTriggers: { getIcon: [colorMode], getSize: [focusId] },
      onClick: ({ object }) => {
        if (object) {
          onSelectMarkerRef.current?.(object.id);
          setPopupReport(object);
        }
      },
    });

    // Cluster bubbles + count labels, drawn only when clustering is engaged.
    // A bubble scales gently with its point count (sqrt so a 100-pt and a
    // 10-pt cluster don't differ 10×); clicking one flies to the zoom where it
    // splits, so a cluster is a drill-in affordance, not a dead dot.
    const clusters = clusterFeatures
      ? clusterFeatures.filter(
          (f): f is Extract<ClusterFeature, { kind: "cluster" }> =>
            f.kind === "cluster",
        )
      : [];
    const clusterLayers =
      clusters.length > 0
        ? [
            new ScatterplotLayer<(typeof clusters)[number]>({
              id: "report-clusters",
              data: clusters,
              parameters: { depthCompare: "always", depthWriteEnabled: false },
              pickable: true,
              stroked: true,
              filled: true,
              lineWidthMinPixels: 2,
              radiusUnits: "pixels",
              getPosition: (c) => [c.lng, c.lat],
              getRadius: (c) => 14 + Math.sqrt(c.count) * 3,
              radiusMinPixels: 16,
              radiusMaxPixels: 48,
              getFillColor: [37, 99, 235, 210],
              getLineColor: [255, 255, 255, 230],
              onClick: ({ object }) => {
                if (!object || !clusterIndex) return;
                const targetZoom = clusterExpansionZoom(
                  clusterIndex,
                  object.clusterId,
                );
                mapRef.current?.getMap()?.flyTo({
                  center: [object.lng, object.lat],
                  zoom: targetZoom,
                });
              },
              updateTriggers: { getRadius: [clusters] },
            }),
            new TextLayer<(typeof clusters)[number]>({
              id: "report-cluster-labels",
              data: clusters,
              parameters: { depthCompare: "always", depthWriteEnabled: false },
              pickable: false,
              getPosition: (c) => [c.lng, c.lat],
              getText: (c) => String(c.count),
              getSize: 13,
              getColor: [255, 255, 255, 255],
              fontWeight: 700,
              getTextAnchor: "middle",
              getAlignmentBaseline: "center",
            }),
          ]
        : [];

    // Halo is built in a separate useMemo (haloLayer); including it here would
    // force an extra array allocation on focusId change but the marker layer
    // still needs focusId in deps so deck.gl sees fresh updateTrigger values.
    // demoGlow sits beneath the pins so the blue halo reads around the tip.
    // is3D deliberately absent: no layer input reads it (pitch is a view prop).
    // Cluster bubbles sit beneath the leaf pins; labels above everything.
    return [demoGlow, ...clusterLayers, markers];
  }, [
    visibleReports,
    focusId,
    viewMode,
    colorMode,
    clusterFeatures,
    clusterIndex,
  ]);

  // Combine base layers with the separately-memoized halo.
  const allLayers = useMemo(
    () => (haloLayer ? [...layers, haloLayer] : layers),
    [layers, haloLayer],
  );

  // bg-background (theme token) so the loading/edge fill matches the app in
  // both themes — a light basemap over a black container flashed a dark void.
  const containerClass = isFullscreen
    ? "h-full w-full relative overflow-hidden bg-background"
    : "h-[300px] w-full sm:h-[450px] lg:h-[550px] relative rounded-xl overflow-hidden border border-hairline bg-background";

  return (
    <div
      role="application"
      aria-label="Map showing infrastructure reports"
      className={containerClass}
    >
      {useGlobe ? (
        <GlobeMapLazy
          reports={visibleReports}
          center={center}
          zoom={zoom}
          focusId={focusId}
          onSelectMarker={onSelectMarker}
          colorMode={colorMode}
          mapTheme={mapTheme}
          onInitError={handleGlobeInitError}
        />
      ) : (
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
          // Feed the live viewport to the clustering layer. onLoad seeds the
          // first bounds; onMoveEnd re-queries after each pan/zoom settles
          // (moveEnd, not move — clustering per animation frame is wasteful).
          onLoad={syncViewFromMap}
          onMoveEnd={syncViewFromMap}
        >
          {/* interleaved=true shares maplibre's WebGL context (single GPU canvas),
            avoiding a second compositor layer + second WebGL context. */}
          <DeckGLOverlay layers={allLayers} interleaved={true} />
          {popupReport && (
            <Popup
              longitude={popupReport.location.lng}
              latitude={popupReport.location.lat}
              // Pin tip sits on the location and the balloon head rises ~40px
              // above it; offset clears the head so the popup doesn't cover it.
              offset={44}
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
      )}

      <style>{`
        @keyframes rmPanelIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rmPanelOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}
        @media (prefers-reduced-motion:reduce){.rm-controls *{animation:none!important}}
      `}</style>
      {/* Floating map controls. In fullscreen the Dispatch panel owns the top-
          right corner AND sits in a higher stacking context (its parent is
          z-10, this map wrapper is z-0), so a right-aligned gear renders
          *underneath* it however high its own z-index. Anchor it top-LEFT in
          fullscreen to stay clear; embedded maps have no panel and keep it
          top-right. top-16 clears the fixed mobile CityHeader in both. */}
      <div
        className={`rm-controls absolute top-16 z-20 flex flex-col gap-2 ${
          isFullscreen ? "left-4 items-start" : "right-4 items-end"
        }`}
      >
        <button
          type="button"
          onClick={togglePanel}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors pointer-events-auto hover:border-white/[0.28] ${glassChrome} ${glassSheen}`}
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
            className={`w-[min(280px,calc(100vw-2rem))] pointer-events-auto ${glassChrome}`}
            style={{
              animation: panelLeaving
                ? "rmPanelOut 150ms cubic-bezier(0.4,0,1,1) forwards"
                : "rmPanelIn 200ms cubic-bezier(0.16,1,0.3,1)",
            }}
            contentClassName={`${glassSheen} p-4 text-white flex flex-col gap-4 max-h-[420px] overflow-y-auto custom-scrollbar`}
            borderRadius="16px"
            blurIntensity="xl"
            shadowIntensity="md"
            glowIntensity="none"
          >
            {/* View mode — markers vs choropleth aggregations */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-2">
                <Sliders className="h-3 w-3 text-zinc-300" />
                View
              </div>
              <div className="grid grid-cols-2 gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
                {(
                  [
                    { key: "markers", label: "Markers", Icon: MapPin },
                    { key: "heatmap", label: "Heatmap", Icon: Flame },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setViewMode(key)}
                    className={`rounded-md py-3 text-[11px] flex items-center justify-center gap-1 transition-all duration-200 min-h-[44px] lg:py-1.5 lg:min-h-0 ${
                      viewMode === key
                        ? "bg-white/15 text-white"
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
                  Density gradient weighted by severity.
                </p>
              )}
            </div>

            {/* Marker colors — only meaningful in the markers view. Shown in
                fullscreen too (unlike the Filters section below). */}
            {viewMode === "markers" && (
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-2">
                  <Palette className="h-3 w-3 text-zinc-300" />
                  Marker colors
                </div>
                <div className="grid grid-cols-3 gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
                  {(
                    [
                      { key: "progress", label: "Progress" },
                      { key: "urgency", label: "Urgency" },
                      { key: "team", label: "Team" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setColorMode(key)}
                      aria-pressed={colorMode === key}
                      className={`rounded-md py-3 text-xs capitalize transition-all min-h-[44px] lg:py-1.5 lg:min-h-0 ${
                        colorMode === key
                          ? "bg-white/15 text-white"
                          : "text-zinc-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Renderer — Cesium 3D globe (default) vs the MapLibre/deck.gl
                flat map. Mirrors the Basemap grid below. The globe is
                unavailable in the heatmap view (deck.gl aggregation has no
                globe equivalent), and disabled outright once Cesium has
                failed to initialise. */}
            <div className="border-t border-white/5 pt-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-2">
                <Globe className="h-3 w-3 text-zinc-300" />
                Renderer
              </div>
              <div className="grid grid-cols-2 gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
                {(
                  [
                    { key: "globe", label: "3D globe" },
                    { key: "flat", label: "Flat map" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setRenderer(key)}
                    disabled={key === "globe" && globeFailedRef.current}
                    aria-pressed={renderer === key}
                    className={`rounded-md py-3 text-xs transition-all min-h-[44px] lg:py-1.5 lg:min-h-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                      renderer === key
                        ? "bg-white/15 text-white"
                        : "text-zinc-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {renderer === "globe" && viewMode !== "markers" && (
                <p className="text-[10.5px] text-zinc-500 mt-1.5 leading-tight">
                  Heatmap renders on the flat map.
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
                        ? "bg-white/15 text-white"
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
                      is3D ? "bg-white/35" : "bg-white/10"
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
                      <span className="text-white flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-white text-white" />
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
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
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
                                isChecked ? "bg-white" : "bg-zinc-700"
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

      {/* Bottom-left chrome: report-count HUD (top) + legend (below), stacked
          in one column so the legend clears the report panel on the right and
          can never overlap the count pill. */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-4 z-20 flex flex-col items-start gap-2">
        {/* HUD: report count */}
        <div
          className={`rounded-full px-3 py-1.5 text-[13px] text-zinc-200 flex items-center gap-1.5 select-none pointer-events-none ${glassChrome} ${glassSheen}`}
        >
          <span className="text-white tabular-nums font-medium">
            {visibleReports.length}
          </span>
          <span className="text-zinc-500">reports</span>
        </div>

        {/* Legend — content depends on view mode */}
        <LiquidGlassCard
          className={`pointer-events-none ${glassChrome}`}
          contentClassName={`${glassSheen} px-3 py-2.5 text-[12px] text-zinc-200 flex flex-col gap-1.5 rounded-[14px]`}
          borderRadius="14px"
          blurIntensity="xl"
          shadowIntensity="md"
          glowIntensity="none"
        >
          {viewMode === "markers" ? (
            // Marker legend — rendered straight from ./pin-icons metadata
            // (PROGRESS_LEGEND / URGENCY_LEGEND / teamLegend) so the swatches and
            // the map pins share one color source and can't drift. This replaces
            // the old statusColor-based swatches; the color palette that used to
            // live inline here now lives in pin-icons.
            <div className="flex flex-col gap-1.5">
              {colorMode === "progress" && (
                // biome-ignore lint/a11y/useSemanticElements: role="list" intentional — <ul> applies UA list-style/margin/padding; flex/gap layout is custom
                <div
                  role="list"
                  aria-label="Marker legend"
                  className="flex flex-col gap-1.5"
                >
                  {PROGRESS_LEGEND.map((e) => (
                    // biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling
                    <div
                      role="listitem"
                      key={e.label}
                      className="flex items-center gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full"
                        style={{
                          background: e.color,
                          border: `1px solid ${e.border ?? "rgba(255,255,255,0.5)"}`,
                        }}
                      >
                        {e.check && (
                          <Check
                            className="h-2 w-2 text-white"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                      {e.label}
                    </div>
                  ))}
                </div>
              )}

              {colorMode === "urgency" && (
                <>
                  <div className="text-[10.5px] uppercase tracking-wider text-zinc-400 mb-0.5">
                    Severity
                  </div>
                  <span
                    className="inline-block h-2 w-24 rounded-sm"
                    style={{
                      background: `linear-gradient(to right, ${URGENCY_LEGEND.colors.join(",")})`,
                    }}
                  />
                  <div className="flex items-center justify-between text-[10.5px] text-zinc-400 -mt-0.5 w-24">
                    <span>{URGENCY_LEGEND.minLabel}</span>
                    <span>{URGENCY_LEGEND.maxLabel}</span>
                  </div>
                </>
              )}

              {colorMode === "team" &&
                (teamLegendData.entries.length === 0 ? (
                  <div className="text-zinc-500">No reports</div>
                ) : (
                  // biome-ignore lint/a11y/useSemanticElements: role="list" intentional — <ul> applies UA list-style/margin/padding; flex/gap layout is custom
                  <div
                    role="list"
                    aria-label="Teams shown"
                    className="flex flex-col gap-1.5"
                  >
                    {teamLegendData.entries.map((e) => (
                      // biome-ignore lint/a11y/useSemanticElements: role="listitem" intentional — sibling of role="list" div; <li> outside a <ul> is invalid and would inherit UA list styling
                      <div
                        role="listitem"
                        key={e.label}
                        className="flex items-center gap-2"
                      >
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: e.color }}
                        />
                        {e.label}
                      </div>
                    ))}
                    {(teamLegendData.more > 0 || teamLegendExpanded) && (
                      <button
                        type="button"
                        onClick={() => setTeamLegendExpanded((v) => !v)}
                        className="pointer-events-auto text-left text-zinc-400 hover:text-white text-[11px] pl-[18px]"
                      >
                        {teamLegendExpanded
                          ? "Show less"
                          : `+${teamLegendData.more} more`}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <>
              <div className="text-[10.5px] uppercase tracking-wider text-zinc-400 mb-0.5">
                Density
              </div>
              <div className="flex items-center gap-2">
                {/* Same amber -> danger family as the heatmap colorRange above —
                  low density fades in as faint amber, high density reads as
                  danger red. */}
                <span className="inline-block h-2 w-20 rounded-sm bg-gradient-to-r from-[#ad8434]/25 via-[#ad8434] to-[#cc4638]" />
              </div>
              <div className="flex items-center justify-between text-[10.5px] text-zinc-400 -mt-0.5">
                <span>Low</span>
                <span>High</span>
              </div>
            </>
          )}
        </LiquidGlassCard>
      </div>
    </div>
  );
}

// memo prevents re-render when parent re-renders with identical props.
// Critical here because parent state (filters, focus) cascades into ReportMap
// re-evaluation which triggers DeckGLOverlay setProps + layer rebuilds.
export const ReportMap = memo(ReportMapInner);

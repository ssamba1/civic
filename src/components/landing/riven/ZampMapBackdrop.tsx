"use client";

import type { Layer as DeckGLLayer } from "@deck.gl/core";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapGL, type MapRef, useControl } from "react-map-gl/maplibre";
import { useMapPreset } from "./MapPresetContext";
import { buildHeatLayer, buildHexLayer, buildMarkerLayers } from "./mapLayers";
import { BUILDINGS_3D_LAYER, CUMMING, makePoints } from "./mapPresets";

/**
 * Zamp hero background. A live, preset-driven MapLibre map of Cumming, GA that
 * fills the hero behind the colossal "Civic" wordmark + glass card.
 *
 *  - It's a BACKDROP: pointer-events-none + interactive={false}, so scroll and
 *    clicks pass through to the page. "Interactivity" is cursor parallax, the
 *    camera leans toward the pointer, not drag/zoom that would trap scroll.
 *  - The active preset (see mapPresets.ts) chooses basemap, camera, render mode
 *    (DOM marker pins vs a deck.gl heat/hex overlay), scrim, and motion.
 *  - Motion ALWAYS plays (orbit / 3D spin / pin pulse), regardless of the OS
 *    reduce-motion setting. The primary dev runs reduce-motion ON and the old
 *    gating made the hero read as frozen for them. The orbit is sub-perceptual
 *    drift, not a vestibular trigger. (memory: reduced-motion-breaks-function.)
 */

const ORBIT_R = 0.004; // ~0.4km camera circle, gentle breathing, not a slide
const ORBIT_PERIOD = 95000; // ms per orbit
const SPIN_PERIOD = 200000; // ms per full bearing rotation (hex 3D view)
const PARALLAX_LNG = 0.006;
const PARALLAX_LAT = 0.004;
const PARALLAX_BEARING = 5; // deg
const LERP = 0.05;

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export default function ZampMapBackdrop() {
  const { preset } = useMapPreset();
  const mapRef = useRef<MapRef | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0 });

  const points = useMemo(() => makePoints(300), []);
  // Markers use a subset so the pin field reads as legible status dots, not
  // clutter; the heat/hex aggregations use the full denser field.
  const markerPoints = useMemo(() => points.slice(0, 96), [points]);

  const layers = useMemo<DeckGLLayer[]>(() => {
    // ?mapMarkers=0, capture-hero-map.mjs shoots a BARE basemap plate. The
    // report field is no longer baked into the JPEG: the landing renders it as
    // DOM severity pins (MapPinStory) so it can animate and ride the parallax.
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mapMarkers") === "0"
    )
      return [];
    if (preset.view === "heatmap") return buildHeatLayer(points);
    if (preset.view === "hex") return buildHexLayer(points, true);
    return buildMarkerLayers(markerPoints, preset.ink);
  }, [preset.view, preset.ink, points, markerPoints]);

  // Capture the opening camera once; preset changes are driven via easeTo below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening frame only, later preset changes ease the camera in the controller effect, not by re-seeding initialViewState.
  const initialViewState = useMemo(
    () => ({
      longitude: CUMMING[0],
      latitude: CUMMING[1],
      zoom: preset.camera.zoom,
      bearing: preset.camera.bearing,
      pitch: preset.camera.pitch,
    }),
    [],
  );

  // Cursor parallax source, desktop/hover only. Stored in a ref so the camera
  // loop reads it without re-subscribing every frame.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // 3D building layer, imperative addLayer/removeLayer so the hyphenated
  // "source-layer" key reaches MapLibre without react-map-gl prop normalization
  // mangling it. Only valid on Carto vector basemaps (source id "carto").
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const id = BUILDINGS_3D_LAYER.id;
    if (preset.buildings3d) {
      if (!map.getLayer(id)) {
        // biome-ignore lint/suspicious/noExplicitAny: as const deeply-readonly doesn't satisfy MapLibre's mutable LayerSpecification
        map.addLayer(BUILDINGS_3D_LAYER as any);
      }
    } else {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    return () => {
      const m = mapRef.current?.getMap();
      if (m?.getLayer(id)) m.removeLayer(id);
    };
  }, [preset.buildings3d, mapLoaded]);

  // Camera controller, eases to the preset's base camera, waits for the map to
  // settle (one 'idle' → flips the QA screenshot flag), then runs the ambient
  // orbit / spin / parallax loop. Re-armed on every preset change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: preset.id + mapLoaded are intentional re-arm triggers (preset.id changes when the look changes; mapLoaded gates the first run until the GL map exists), not values read inside.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    let raf = 0;
    // Visibility gate, the ambient orbit/spin/parallax loop calls setCenter/
    // setBearing every frame, which repaints the whole GL canvas. Left running
    // while the hero is scrolled out of view it competes with the rest of the
    // page for the main thread / GPU and reads as scroll jank. Pause the loop
    // whenever the hero leaves the viewport; the IntersectionObserver below
    // restarts it on re-entry. Keyed off visibility ONLY. NOT reduce-motion;
    // the forced-on motion is a deliberate product decision (see memory).
    let visible = true;
    const base = preset.camera;
    const setIdle = (v: boolean) => {
      (window as unknown as { __civicMapIdle?: boolean }).__civicMapIdle = v;
    };
    setIdle(false);

    map.easeTo({
      center: CUMMING,
      zoom: base.zoom,
      bearing: base.bearing,
      pitch: base.pitch,
      duration: 700,
    });

    const cur = { lng: CUMMING[0], lat: CUMMING[1], bearing: base.bearing };
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      let tLng = CUMMING[0];
      let tLat = CUMMING[1];
      let tBearing = base.bearing;

      if (preset.motion.orbit) {
        const a = (t / ORBIT_PERIOD) * Math.PI * 2;
        tLng += Math.cos(a) * ORBIT_R;
        tLat += Math.sin(a) * ORBIT_R * 0.6;
      }
      if (preset.motion.spin) {
        tBearing = base.bearing + (t / SPIN_PERIOD) * 360;
      }
      const { x, y } = pointerRef.current;
      tLng += x * PARALLAX_LNG;
      tLat += -y * PARALLAX_LAT;
      tBearing += x * PARALLAX_BEARING;

      cur.lng += (tLng - cur.lng) * LERP;
      cur.lat += (tLat - cur.lat) * LERP;
      // Shortest-path bearing lerp.
      const db = ((tBearing - cur.bearing + 540) % 360) - 180;
      cur.bearing += db * LERP;
      map.setCenter([cur.lng, cur.lat]);
      map.setBearing(cur.bearing);
      // Stop scheduling frames while offscreen; the observer re-arms on re-entry.
      raf = visible ? requestAnimationFrame(tick) : 0;
    };

    const startLoop = () => {
      setIdle(true);
      if (!raf && visible) raf = requestAnimationFrame(tick);
    };
    map.once("idle", startLoop);
    // Fallback: if 'idle' never fires (e.g. easeTo is a no-op because the new
    // camera equals the current one), start the loop anyway so the map is never
    // left permanently static. startLoop() is idempotent (guarded by `if (!raf)`).
    const fallback = setTimeout(startLoop, 1200);

    // Pause the per-frame camera loop when the hero scrolls out of view.
    let io: IntersectionObserver | null = null;
    const container = containerRef.current;
    if (container && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
          if (visible && !raf) raf = requestAnimationFrame(tick);
        },
        { threshold: 0 },
      );
      io.observe(container);
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      io?.disconnect();
      map.off("idle", startLoop);
      setIdle(false);
    };
  }, [preset.id, preset.camera, preset.motion, mapLoaded]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-hero-bg="map"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={preset.basemap}
        interactive={false}
        attributionControl={{ compact: true }}
        onLoad={() => setMapLoaded(true)}
        reuseMaps
        maxTileCacheSize={1000}
        refreshExpiredTiles={false}
        fadeDuration={150}
        localIdeographFontFamily="sans-serif"
        style={{ width: "100%", height: "100%", filter: preset.mapFilter }}
      >
        <DeckGLOverlay layers={layers} interleaved={true} />
      </MapGL>

      {/* Scrim, atmosphere + fade that seats the wordmark. Preset-specific so
          dark basemaps get a dark fade (white ink) and light ones a light fade
          (black ink). Sits above the canvas, inherits pointer-events-none. */}
      <div className="absolute inset-0" style={{ background: preset.scrim }} />
    </div>
  );
}

"use client";

import type * as CesiumNS from "cesium";
import { useEffect, useRef, useState } from "react";
import { renderPopupHTML } from "@/components/map/map-popup";
import {
  type MarkerColorMode,
  pinColorRGB,
  pinIconFor,
} from "@/components/map/pin-icons";
import type { DashboardReport } from "@/lib/dashboard-data";
import { useCurrency } from "@/lib/use-currency";

/* ------------------------------------------------------------------
   Cesium is loaded from its PREBUILT UMD bundle at /cesium/Cesium.js,
   not imported through the app bundler.

   `await import("cesium")` is the obvious approach and it is broken here:
   Cesium inlines binary payloads as strings containing NUL escapes, and
   the bundler re-emits those inside template literals, which is a hard
   parse error ("Octal escape sequences are not allowed in template
   strings"). That kills the whole 4.8 MB chunk, and with it every
   client component on the page, so the map rendered nothing at all and
   even the MapLibre fallback never got a chance to mount.

   Loading the prebuilt file by URL sidesteps the bundler entirely, and
   drops that chunk from the client payload as a bonus. The file is
   copied out of node_modules by scripts/copy-cesium-assets.mjs.
   ------------------------------------------------------------------ */

declare global {
  interface Window {
    Cesium?: typeof CesiumNS;
    CESIUM_BASE_URL?: string;
  }
}

let cesiumLoader: Promise<typeof CesiumNS> | null = null;

function loadCesium(): Promise<typeof CesiumNS> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumLoader) return cesiumLoader;

  cesiumLoader = new Promise<typeof CesiumNS>((resolve, reject) => {
    // Must be set before Cesium.js evaluates. It reads this to resolve
    // its Workers/Assets/Widgets URLs.
    window.CESIUM_BASE_URL = "/cesium";

    if (!document.querySelector("link[data-cesium-widgets]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/cesium/Widgets/widgets.css";
      link.dataset.cesiumWidgets = "";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => {
      if (window.Cesium) resolve(window.Cesium);
      else reject(new Error("Cesium.js loaded but window.Cesium is missing"));
    };
    script.onerror = () =>
      reject(new Error("Failed to load /cesium/Cesium.js"));
    document.head.appendChild(script);
  });

  // A failed load must not poison later attempts (renderer toggle, remount).
  cesiumLoader.catch(() => {
    cesiumLoader = null;
  });
  return cesiumLoader;
}

/* ==================================================================
   CesiumJS 3D globe renderer for the report map.

   Modeled on bilawalsidhu/gods-eye-view (MIT), specifically its viewer
   bootstrap (all default widget chrome off, an explicit credit container
   we can style, targetFrameRate capped at 60 so the loop doesn't run at
   a 120 Hz panel's refresh for zero visual benefit). None of its app code
   is vendored.

   This component renders the SAME report corpus with the SAME teardrop
   pin SVGs and the SAME color modes as the deck.gl IconLayer path in
   report-map.tsx. PinIconFor / pinColorRGB stay the single source of
   truth, so the legend can never drift from the globe. Clicking a pin
   calls onSelectMarker with the report id, i.e. the identical selection
   contract the Dispatch panel already consumes.

   Tile sourcing degrades instead of throwing:
     - no NEXT_PUBLIC_CESIUM_ION_TOKEN -> plain ellipsoid globe on the
       keyless Esri raster basemaps below (already CSP-allowed), no
       terrain, no buildings. Usable, just flat ground.
     - token set -> ion World Terrain + Cesium OSM Buildings (both free
       tier), i.e. real elevation and real 3D building geometry.
   ================================================================== */

export type GlobeBasemap = "dark" | "light" | "satellite";

interface GlobeMapProps {
  reports: DashboardReport[];
  center: [number, number]; // [lng, lat]
  zoom: number;
  focusId?: string | null;
  onSelectMarker?: (id: string) => void;
  colorMode: MarkerColorMode;
  mapTheme: GlobeBasemap;
  /** Called once if WebGL2/Cesium cannot initialise. Parent falls back. */
  onInitError: (reason: string) => void;
}

const ION_TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

/* ------------------------------------------------------------------
   Raster basemaps.

   Deliberately NOT the Carto raster endpoints that mirror the MapLibre
   styles: Carto's *vector* styles (what report-map.tsx loads) are keyless,
   but every `basemaps.cartocdn.com` RASTER tile now comes back stamped
   "API KEY REQUIRED", verified 2026-08 against dark_all, light_all and
   rastertiles/voyager. Esri's Canvas Dark/Light Gray pair is the keyless
   equivalent, is the same cartographic register as dark-matter/voyager,
   and lives on a host (*.arcgisonline.com) that the CSP already allows
   because the satellite style uses it.
   ------------------------------------------------------------------ */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
// Canvas base + its matching label/road reference overlay. The base carries no
// place names on its own, so both layers are added, in this order.
const ESRI_CANVAS: Record<"dark" | "light", { base: string; ref: string }> = {
  dark: {
    base: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  },
  light: {
    base: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    ref: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  },
};
// The Canvas services stop at z16; past it Cesium upsamples the last real tile.
const ESRI_CANVAS_MAX_ZOOM = 16;
// Same Esri service (and the same z18 real-imagery ceiling) as
// ./satellite-style. Past z18 Esri returns a grey placeholder, so cap it and
// let Cesium upsample instead.
const ESRI_SAT = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const ESRI_MAX_ZOOM = 18;

/**
 * Distance from the camera to its ground target that frames roughly the same
 * ground span a Web-Mercator map at `zoom` would show in a viewport this wide.
 * Cesium's default frustum uses `fov` as the HORIZONTAL field of view whenever
 * the canvas is wider than it is tall, which is the case for every map surface
 * here, hence width, not height.
 */
function rangeForZoom(
  zoom: number,
  latDeg: number,
  viewportWidthPx: number,
  fovRadians: number,
): number {
  const metresPerPixel =
    (40075016.686 * Math.cos((latDeg * Math.PI) / 180)) / (256 * 2 ** zoom);
  const spanMetres = metresPerPixel * Math.max(320, viewportWidthPx);
  return spanMetres / (2 * Math.tan(fovRadians / 2));
}

// Camera attitude shared by the initial view and every focus fly-to, matching
// the 2D map's pitch 45 / bearing -20 tilt.
const HEADING_DEG = -20;
const PITCH_DEG = -55;

/**
 * Point the camera AT a lng/lat with the shared tilt, framed to `zoom`.
 * flyToBoundingSphere / lookAt frame the *target*; a plain `setView` with a
 * pitched orientation instead places the camera's eye there and looks off into
 * the distance, which put Cumming's pins far below the bottom of the screen.
 */
function frameOn(
  Cesium: typeof CesiumNS,
  viewer: CesiumNS.Viewer,
  lng: number,
  lat: number,
  zoom: number,
  fly: boolean,
): void {
  const frustum = viewer.camera.frustum as CesiumNS.PerspectiveFrustum;
  const range = rangeForZoom(
    zoom,
    lat,
    viewer.scene.canvas.clientWidth,
    frustum.fov ?? Math.PI / 3,
  );
  const offset = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(HEADING_DEG),
    Cesium.Math.toRadians(PITCH_DEG),
    range,
  );
  const sphere = new Cesium.BoundingSphere(
    Cesium.Cartesian3.fromDegrees(lng, lat),
    0,
  );
  if (fly) {
    viewer.camera.flyToBoundingSphere(sphere, { offset, duration: 1.4 });
  } else {
    viewer.camera.viewBoundingSphere(sphere, offset);
    // viewBoundingSphere locks the camera into the target's reference frame;
    // resetting the transform hands control back to the user's mouse.
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
}

let loggedDegrade = false;

/** Fixed pixel height of a pin, mirroring the IconLayer getSize ramp. */
function pinPixelHeight(r: DashboardReport, focused: boolean): number {
  const base = 24 + r.severity * 2;
  const sized = r.demo ? base + 12 : base;
  return focused ? sized * 1.28 : sized;
}

export function GlobeMap({
  reports,
  center,
  zoom,
  focusId,
  onSelectMarker,
  colorMode,
  mapTheme,
  onInitError,
}: GlobeMapProps) {
  const currency = useCurrency();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const creditRef = useRef<HTMLDivElement | null>(null);
  const popupElRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const cesiumRef = useRef<typeof CesiumNS | null>(null);
  const imageryLayerRef = useRef<CesiumNS.ImageryLayer[]>([]);
  const lastFlownIdRef = useRef<string | null>(null);
  const popupReportRef = useRef<DashboardReport | null>(null);
  // onSelectMarker is held in a ref so an inline parent callback never forces
  // the picking handler to be torn down and re-registered.
  const onSelectMarkerRef = useRef(onSelectMarker);
  onSelectMarkerRef.current = onSelectMarker;

  const [ready, setReady] = useState(false);
  const [popupReport, setPopupReport] = useState<DashboardReport | null>(null);
  popupReportRef.current = popupReport;

  // --- Viewer bootstrap (once) ------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once bootstrap. center/zoom seed the initial camera only; later changes are handled by the focus effect, and re-running this would destroy and rebuild the whole GL context.
  useEffect(() => {
    let destroyed = false;
    const el = containerRef.current;
    if (!el) return;

    (async () => {
      try {
        // Cesium fetches its Workers/Assets/Widgets by URL at runtime; they
        // are copied to public/cesium by scripts/copy-cesium-assets.mjs. This
        // must be set before the module is evaluated.
        const Cesium = await loadCesium();
        if (destroyed) return;
        cesiumRef.current = Cesium;

        if (ION_TOKEN) Cesium.Ion.defaultAccessToken = ION_TOKEN;

        const viewer = new Cesium.Viewer(el, {
          // Minimal chrome, every default widget off (gods-eye-view pattern).
          timeline: false,
          animation: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          vrButton: false,
          selectionIndicator: false,
          infoBox: false,
          baseLayer: false,
          creditContainer: creditRef.current ?? undefined,
        });
        if (destroyed) {
          viewer.destroy();
          return;
        }
        viewerRef.current = viewer;
        // Cap the render loop at 60fps: on a 120 Hz panel Cesium otherwise
        // burns double the GPU for no visual gain on a map surface.
        viewer.targetFrameRate = 60;

        frameOn(Cesium, viewer, center[0], center[1], zoom, false);

        // Pin picking -> the existing selection contract.
        viewer.screenSpaceEventHandler.setInputAction(
          (movement: { position: CesiumNS.Cartesian2 }) => {
            const picked = viewer.scene.pick(movement.position);
            const id: unknown = picked?.id?.id;
            if (typeof id === "string" && id.startsWith("pin:")) {
              onSelectMarkerRef.current?.(id.slice(4));
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        // Popup follows its report every frame. Written straight to the DOM
        // rather than through React state. A setState per rendered frame
        // would thrash reconciliation for a purely positional update.
        viewer.scene.postRender.addEventListener(() => {
          const node = popupElRef.current;
          const rep = popupReportRef.current;
          if (!node) return;
          if (!rep) {
            node.style.display = "none";
            return;
          }
          const world = Cesium.Cartesian3.fromDegrees(
            rep.location.lng,
            rep.location.lat,
          );
          const win = Cesium.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            world,
          );
          if (!win) {
            node.style.display = "none";
            return;
          }
          node.style.display = "block";
          node.style.transform = `translate(-50%, -100%) translate(${Math.round(win.x)}px, ${Math.round(win.y) - 44}px)`;
        });

        setReady(true);

        // Optional ion-backed elevation + real 3D buildings. Both are free
        // tier; both are skipped (quietly, once) with no token.
        if (ION_TOKEN) {
          try {
            viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
            if (destroyed || viewer.isDestroyed()) return;
            const buildings = await Cesium.createOsmBuildingsAsync();
            if (destroyed || viewer.isDestroyed()) return;
            viewer.scene.primitives.add(buildings);
          } catch (err) {
            console.warn(
              "[GlobeMap] Cesium ion terrain/buildings unavailable; continuing on the plain globe.",
              err,
            );
          }
        } else if (!loggedDegrade) {
          loggedDegrade = true;
          console.info(
            "[GlobeMap] No NEXT_PUBLIC_CESIUM_ION_TOKEN - rendering the plain ellipsoid globe (no terrain, no 3D buildings).",
          );
        }
      } catch (err) {
        onInitError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      destroyed = true;
      // Destroying the viewer is what releases the WebGL context, the render
      // loop, and every worker it spawned. Skipping it is the classic Cesium
      // leak. A remount then runs two globes against one GPU.
      const v = viewerRef.current;
      viewerRef.current = null;
      imageryLayerRef.current = [];
      if (v && !v.isDestroyed()) v.destroy();
    };
  }, [onInitError]);

  // --- Basemap imagery, following the app theme -------------------------
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;
    const urls =
      mapTheme === "satellite"
        ? [{ url: ESRI_SAT, max: ESRI_MAX_ZOOM }]
        : [
            { url: ESRI_CANVAS[mapTheme].base, max: ESRI_CANVAS_MAX_ZOOM },
            { url: ESRI_CANVAS[mapTheme].ref, max: ESRI_CANVAS_MAX_ZOOM },
          ];
    const layers = viewer.imageryLayers;
    const next = urls.map(({ url, max }) =>
      layers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url,
          maximumLevel: max,
          credit: "Esri",
        }),
      ),
    );
    const prev = imageryLayerRef.current;
    imageryLayerRef.current = next;
    for (const layer of prev) layers.remove(layer, true);
    return () => {
      if (viewer.isDestroyed()) return;
      if (imageryLayerRef.current === next) {
        for (const layer of next) layers.remove(layer, true);
        imageryLayerRef.current = [];
      }
    };
  }, [mapTheme, ready]);

  // --- Report entities --------------------------------------------------
  // Rebuilt wholesale whenever the corpus, color mode, or focus changes. At
  // pilot corpus size (hundreds of pins) this is far cheaper than diffing,
  // and it keeps the rendered set provably identical to `reports`. No
  // supercluster pass here: Cesium billboards stay smooth well past the 500
  // point threshold where the deck.gl IconLayer needs aggregation.
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;
    const ents = viewer.entities;
    ents.suspendEvents();
    ents.removeAll();
    for (const r of reports) {
      const focused = r.id === focusId;
      const icon = pinIconFor(r, colorMode);
      const pos = Cesium.Cartesian3.fromDegrees(r.location.lng, r.location.lat);
      ents.add({
        id: `pin:${r.id}`,
        position: pos,
        billboard: {
          image: icon.url,
          // anchorY = raster height in the IconLayer: the teardrop's tip sits
          // on the report location and the head rises above it.
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          scale: pinPixelHeight(r, focused) / icon.height,
          // Pins are an overlay, not geometry. Never occluded by terrain or
          // buildings. This is the Cesium analogue of the deck.gl layers'
          // depthCompare:"always".
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      if (r.demo) {
        // Blue presenter glow beneath the demo report, same affordance the
        // deck.gl ScatterplotLayer carries on the 2D map.
        const radius = 220 + r.severity * 60;
        ents.add({
          id: `glow:${r.id}`,
          position: pos,
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: Cesium.Color.fromBytes(10, 132, 255, focused ? 120 : 90),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
      if (focused) {
        const [cr, cg, cb] = pinColorRGB(r, colorMode);
        ents.add({
          id: `halo:${r.id}`,
          position: pos,
          ellipse: {
            semiMajorAxis: 180,
            semiMinorAxis: 180,
            fill: false,
            outline: true,
            outlineWidth: 2,
            outlineColor: Cesium.Color.fromBytes(cr, cg, cb, 200),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    }
    ents.resumeEvents();
    if (process.env.NODE_ENV !== "production") {
      // e2e handle: lets the Playwright spec assert on the real entity
      // collection instead of guessing at canvas pixels. Dev/test only.
      (
        window as unknown as { __civicGlobe?: { viewer: CesiumNS.Viewer } }
      ).__civicGlobe = { viewer };
    }
  }, [reports, colorMode, focusId, ready]);

  // --- Camera + popup follow the focused report -------------------------
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;
    if (!focusId) {
      lastFlownIdRef.current = null;
      setPopupReport(null);
      return;
    }
    const focused = reports.find((r) => r.id === focusId);
    if (!focused) return;
    setPopupReport(focused);
    if (lastFlownIdRef.current === focusId) return;
    lastFlownIdRef.current = focusId;
    frameOn(
      Cesium,
      viewer,
      focused.location.lng,
      focused.location.lat,
      Math.max(zoom, 15),
      true,
    );
  }, [focusId, reports, zoom, ready]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="globe-map-container"
      />

      {/* Popup. Same renderPopupHTML the MapLibre path uses, so the card is
          byte-identical between renderers. Positioned imperatively above. */}
      <div
        ref={popupElRef}
        className="civic-globe-popup pointer-events-none absolute left-0 top-0 z-30 hidden max-w-[min(300px,90vw)]"
      >
        {popupReport && (
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: renderPopupHTML esc()-escapes every user-controlled field; same trusted builder the MapLibre popup uses.
            dangerouslySetInnerHTML={{
              __html: renderPopupHTML(popupReport, currency),
            }}
          />
        )}
      </div>

      {/* Attribution. Cesium requires a credit container; giving it our own
          keeps it inside the map surface and on Civic tokens. Bottom-CENTER,
          not bottom-right: in fullscreen the Dispatch panel owns the right
          edge and the legend/HUD stack owns the left one. */}
      <div className="civic-globe-credits pointer-events-none absolute inset-x-0 bottom-1 z-20 flex flex-col items-center gap-0.5 text-[10px] text-faint">
        {/* The keyless globe renders a plain ellipsoid, correct, just without
            terrain or 3D buildings. This used to print
            "Set NEXT_PUBLIC_CESIUM_ION_TOKEN …" into the map surface, which
            reads to anyone looking at the product as an unfinished build. The
            operator signal belongs in the console, not on the map. */}
        <div ref={creditRef} />
      </div>
    </div>
  );
}

// Empirical test: does Carto's free vector basemap carry building-height data,
// and does Cumming, GA have enough buildings for a 3D fill-extrusion hero to
// look good? Standalone maplibre (CDN). Does NOT touch the app.
// Usage: node scripts/test3d.mjs [styleUrl] [zoom] [outPath]
import { chromium } from "playwright";

const style =
  process.argv[2] ??
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const zoom = Number.parseFloat(process.argv[3] ?? "16");
const out = process.argv[4] ?? "scripts/shots/3d-test.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("PAGEERR:", e.message));

await page.setContent(
  `<!doctype html><html><head>
   <link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">
   <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
   <style>html,body,#map{margin:0;height:100%;width:100%;background:#08090d}</style>
   </head><body><div id="map"></div></body></html>`,
  { waitUntil: "load" },
);
await page.waitForFunction("window.maplibregl !== undefined", { timeout: 20000 });

const diag = await page.evaluate(
  async ({ style, zoom }) => {
    const map = new window.maplibregl.Map({
      container: "map",
      style,
      center: [-84.1402, 34.2073], // Cumming, GA
      zoom,
      pitch: 62,
      bearing: -20,
      attributionControl: false,
    });
    await new Promise((res) => map.once("idle", res));

    const sources = Object.entries(map.getStyle().sources)
      .filter(([, s]) => s.type === "vector")
      .map(([id]) => id);
    const buildingLayers = map
      .getStyle()
      .layers.filter((l) => l["source-layer"] === "building")
      .map((l) => ({ id: l.id, type: l.type, source: l.source }));

    // Try to add a 3D extrusion from the first vector source's `building` layer.
    let added = false;
    let sampleProps = null;
    let featCount = 0;
    if (sources.length) {
      const vsrc = sources[0];
      try {
        map.addLayer({
          id: "test-3d",
          type: "fill-extrusion",
          source: vsrc,
          "source-layer": "building",
          minzoom: 13,
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "render_height"], ["get", "height"], 6],
              0,
              "#222b3a",
              40,
              "#3b4a66",
              120,
              "#5a6ea0",
            ],
            "fill-extrusion-height": [
              "coalesce",
              ["get", "render_height"],
              ["get", "height"],
              8,
            ],
            "fill-extrusion-base": [
              "coalesce",
              ["get", "render_min_height"],
              ["get", "min_height"],
              0,
            ],
            "fill-extrusion-opacity": 0.92,
          },
        });
        added = true;
      } catch (e) {
        return { error: String(e), sources, buildingLayers };
      }
      await new Promise((res) => setTimeout(res, 2500));
      const feats = map.queryRenderedFeatures({ layers: ["test-3d"] });
      featCount = feats.length;
      sampleProps = feats[0]?.properties ?? null;
    }
    return { sources, buildingLayers, added, featCount, sampleProps };
  },
  { style, zoom },
);

console.log("DIAG:", JSON.stringify(diag, null, 2));
await page.waitForTimeout(800);
await page.screenshot({ path: out });
console.log("SHOT ->", out);
await browser.close();

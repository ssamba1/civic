import { describe, expect, it } from "vitest";
import { SATELLITE_STYLE } from "./satellite-style";

// Regression: Esri World_Imagery returns a "Map data not yet available"
// placeholder tile (HTTP 200, ~2.5KB) above its per-region imagery ceiling.
// Over Ahilyanagar that ceiling is z18; a maxzoom of 19 made the satellite
// basemap show the placeholder when zoomed in. The source maxzoom must stay
// at/below the verified Esri ceiling so MapLibre overzooms the real z18 tile
// instead of requesting the placeholder.
describe("SATELLITE_STYLE (Esri raster basemap)", () => {
  const source = SATELLITE_STYLE.sources.sat;

  it("uses an Esri World_Imagery raster source", () => {
    expect(source.type).toBe("raster");
    if (source.type !== "raster") throw new Error("expected raster source");
    expect(source.tiles?.[0]).toContain(
      "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery",
    );
  });

  it("caps maxzoom at the Esri imagery ceiling (<= 18) to avoid placeholder tiles", () => {
    if (source.type !== "raster") throw new Error("expected raster source");
    expect(source.maxzoom).toBeLessThanOrEqual(18);
  });
});

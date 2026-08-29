import { expect, test } from "playwright/test";

/**
 * Cesium globe renderer smoke. Asserts the city map route boots the 3D globe
 * (not just the MapLibre fallback), that Civic's report pins actually landed on
 * it as Cesium entities, and that nothing was blocked by the CSP or thrown to
 * the console on the way. The `window.__civicGlobe` handle is a dev/test-only
 * export from components/map/globe-map.tsx.
 */
test("/city/cumming/map renders the Cesium globe with report pins", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const res = await page.goto("/city/cumming/map");
  expect(res?.status()).toBeLessThan(400);

  // Cesium mounts its own canvas inside the container we hand it.
  const canvas = page.locator(
    '[data-testid="globe-map-container"] canvas.cesium-widget-credits, [data-testid="globe-map-container"] canvas',
  );
  await expect(canvas.first()).toBeVisible({ timeout: 45_000 });

  // The globe holds the same corpus the flat map would draw. Entity ids are
  // prefixed `pin:<reportId>` — the selection contract the Dispatch panel uses.
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __civicGlobe?: { viewer: { entities: { values: unknown[] } } };
        }
      ).__civicGlobe?.viewer.entities.values.length,
    undefined,
    { timeout: 45_000 },
  );
  const pinCount = await page.evaluate(
    () =>
      (
        window as unknown as {
          __civicGlobe: {
            viewer: { entities: { values: { id: string }[] } };
          };
        }
      ).__civicGlobe.viewer.entities.values.filter((e) =>
        String(e.id).startsWith("pin:"),
      ).length,
  );
  expect(pinCount).toBeGreaterThan(0);

  // CSP regressions surface as console errors ("Refused to connect to ...").
  const csp = consoleErrors.filter((t) =>
    /refused to|content security/i.test(t),
  );
  expect(csp).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("the map controls can swap the globe for the MapLibre renderer", async ({
  page,
}) => {
  await page.goto("/city/cumming/map");
  await expect(
    page.locator('[data-testid="globe-map-container"] canvas').first(),
  ).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: /toggle map controls/i }).click();
  await page.getByRole("button", { name: "Flat map", exact: true }).click();

  // MapLibre owns the canvas once the flat renderer takes over, and the globe
  // container is gone entirely.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="globe-map-container"]')).toHaveCount(
    0,
  );
});

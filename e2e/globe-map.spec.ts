import { expect, type Page, test } from "playwright/test";

/**
 * Cesium globe renderer smoke. Asserts the globe boots with Civic's report pins
 * on it, and that nothing was blocked by the CSP or thrown to the console on the
 * way. The `window.__civicGlobe` handle is a dev/test-only export from
 * components/map/globe-map.tsx.
 *
 * The map route defaults to the FLAT renderer (9a05f50, the globe cost 8.7 MB
 * over 113 requests and ~10.5 s of blocked main thread), so the globe is opt-in
 * through the map controls. These specs opt in explicitly rather than assuming a
 * default; a regression that flips the default back would not silently pass.
 */

/**
 * Switch the renderer, opening the controls popover only if it is not already
 * open. Picking a renderer leaves the popover up, so an unconditional toggle
 * would close it and the next renderer button would never be clickable.
 */
async function selectRenderer(
  page: Page,
  label: "3D globe" | "Flat map",
): Promise<void> {
  const button = page.getByRole("button", { name: label, exact: true });
  if (!(await button.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /toggle map controls/i }).click();
  }
  await button.click();
}

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

  // Flat is the default; the flat renderer must come up before we swap.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await selectRenderer(page, "3D globe");

  // Cesium mounts its own canvas inside the container we hand it.
  const canvas = page.locator(
    '[data-testid="globe-map-container"] canvas.cesium-widget-credits, [data-testid="globe-map-container"] canvas',
  );
  await expect(canvas.first()).toBeVisible({ timeout: 45_000 });

  // The globe holds the same corpus the flat map would draw. Entity ids are
  // prefixed `pin:<reportId>`. The selection contract the Dispatch panel uses.
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

test("the map controls can swap the globe back to the MapLibre renderer", async ({
  page,
}) => {
  await page.goto("/city/cumming/map");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 30_000,
  });

  await selectRenderer(page, "3D globe");
  await expect(
    page.locator('[data-testid="globe-map-container"] canvas').first(),
  ).toBeVisible({ timeout: 45_000 });

  await selectRenderer(page, "Flat map");

  // MapLibre owns the canvas once the flat renderer takes over, and the globe
  // container is gone entirely.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-testid="globe-map-container"]')).toHaveCount(
    0,
  );
});

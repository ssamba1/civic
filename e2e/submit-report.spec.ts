import { expect, test } from "playwright/test";

/**
 * Resident report-flow smoke (B13). Headless Chromium has no camera, so the
 * flow can't be driven to a real submission here (that also needs Supabase
 * storage + Gemini). This asserts the flow is REACHABLE and renders its shell
 * without crashing — the stable, data-independent contract. Full submit +
 * classification is covered by unit/integration tests, not this smoke.
 */
test("/report loads the capture step without crashing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/report");

  // The flow opens on the camera step; a back-to-home link is always present.
  await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
  // No uncaught client exception mounting the camera/upload UI. getUserMedia
  // rejections are handled in-app (fallback to file input), not thrown.
  expect(errors).toEqual([]);
});

test("/report exposes a file-upload fallback when no camera is available", async ({
  page,
}) => {
  await page.goto("/report");
  // CameraCapture renders hidden file inputs (camera + library), both
  // accept=image/*, as the fallback for devices / headless contexts without
  // getUserMedia.
  const fileInputs = page.locator('input[type="file"][accept*="image"]');
  expect(await fileInputs.count()).toBeGreaterThan(0);
});

import { expect, test } from "playwright/test";

/**
 * Pre-submit duplicate deflection smoke (B14, LCP-19). The deflection modal
 * ("Add your voice") only appears when a submission finds a nearby open report,
 * which needs seeded data + a completed submit against Supabase — out of scope
 * for a hermetic smoke. What IS stable and worth locking: uploading a photo
 * advances the flow from capture → preview (the precondition the dedup check
 * runs after), exercising the real client blur pipeline without a network write.
 */

// A minimal valid 1×1 PNG — decodes in Chromium so createImageBitmap/blur runs.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

test("uploading a photo advances capture → preview (dedup runs after this)", async ({
  page,
}) => {
  await page.goto("/report");

  // Feed the hidden camera/library file input (headless has no live camera).
  const fileInput = page.locator('input[type="file"][accept*="image"]').first();
  await fileInput.setInputFiles({
    name: "issue.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });

  // The back-to-home link is rendered ONLY on the camera step. Once the upload
  // is processed (client blur + re-encode) the flow advances to preview and the
  // link unmounts — a robust signal the capture → preview transition ran, which
  // is the precondition the dedup check fires after.
  await expect(page.getByRole("link", { name: /back to home/i })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
});

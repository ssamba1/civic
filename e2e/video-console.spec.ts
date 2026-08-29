import { expect, type Locator, type Page, test } from "playwright/test";

/**
 * Clip theater smoke (video damage mapping console). Drives the real page:
 * transport bar, playback, rail-item seeking, report disclosure and the
 * detector overlay. Requires DEV_AUTH_BYPASS=1 + VIDEO_PIPELINE=1 (both are in
 * .env.local) so the staff gate resolves without a login, and seeded clips —
 * the assertions are deliberately count-agnostic because the seed size varies.
 *
 * Specs live in e2e/ (playwright.config.ts testDir), not tests/e2e/.
 */

const VIDEO_PATH = "/city/cumming/video";

function videoEl(page: Page): Locator {
  return page.locator('[data-testid="clip-video"]');
}

function currentTime(page: Page): Promise<number> {
  return videoEl(page).evaluate((v) => (v as HTMLVideoElement).currentTime);
}

/** Rail items whose detection already settled expose a "Report" disclosure. */
function railItems(page: Page): Locator {
  return page.locator('[data-testid="detection-item"]');
}

async function openTheater(page: Page): Promise<void> {
  const res = await page.goto(VIDEO_PATH);
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator('[data-testid="clip-transport"]')).toBeVisible();
}

test("the clip theater renders a transport bar and a populated rail", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTheater(page);

  const transport = page.locator('[data-testid="clip-transport"]');
  await expect(transport.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(transport.getByRole("slider", { name: "Seek" })).toBeVisible();
  await expect(
    transport.getByRole("button", { name: "Restart clip" }),
  ).toBeVisible();

  // Count-agnostic: the seed grows, the rail must simply not be empty.
  expect(await railItems(page).count()).toBeGreaterThan(0);
  // Every not-yet-reached item reads as waiting, never as a stalled job.
  await expect(railItems(page).first()).toHaveAttribute(
    "data-phase",
    "waiting",
  );
  expect(errors).toEqual([]);
});

test("pressing Play advances the playhead", async ({ page }) => {
  await openTheater(page);
  await page
    .locator('[data-testid="clip-transport"]')
    .getByRole("button", { name: "Play" })
    .click();

  await expect
    .poll(() => currentTime(page), { timeout: 20_000 })
    .toBeGreaterThan(0.25);
});

test("clicking a rail item seeks the video to that detection", async ({
  page,
}) => {
  await openTheater(page);
  const items = railItems(page);
  const count = await items.count();
  // Mid-rail, so the seek is a real jump rather than a no-op at t=0.
  const target = items.nth(Math.min(count - 1, Math.floor(count / 2)));
  const tsText =
    (await target.locator('[data-testid="detection-ts"]').textContent()) ?? "";
  const ts = Number.parseFloat(tsText);
  expect(Number.isFinite(ts)).toBe(true);

  await target.getByRole("button").first().click();

  // The rail seeks to ts − 0.5 and resumes playing, so allow forward drift.
  await expect
    .poll(() => currentTime(page), { timeout: 15_000 })
    .toBeGreaterThan(ts - 0.75);
  expect(await currentTime(page)).toBeLessThan(ts + 3);
});

test("a settled detection expands its generated report inline", async ({
  page,
}) => {
  await openTheater(page);
  const items = railItems(page);
  const count = await items.count();

  // Seek to the last detection: everything before it is settled, so the
  // report disclosures of dispatched clusters are rendered.
  await items
    .nth(count - 1)
    .getByRole("button")
    .first()
    .click();

  const disclosure = page
    .locator('[data-testid="detection-item"] summary')
    .filter({ hasText: "Report" })
    .first();
  await expect(disclosure).toBeVisible({ timeout: 15_000 });
  await disclosure.click();

  const body = page.locator('[data-testid="report-body"]').first();
  await expect(body).toBeVisible();
  // The inline report block always carries a status chip and a location line.
  await expect(body.getByText(/Sev [1-5]/)).toBeVisible();
});

test("the detector overlay draws boxes while the clip plays", async ({
  page,
}) => {
  await openTheater(page);

  const published = await page
    .getByText("Boxes are the detector's own per-frame output", {
      exact: false,
    })
    .count();
  test.skip(
    published === 0,
    "selected clip publishes no per-frame detection track",
  );

  await page
    .locator('[data-testid="clip-transport"]')
    .getByRole("button", { name: "Play" })
    .click();

  const rects = page.locator('[data-testid="detector-overlay"] rect');
  await expect
    .poll(() => rects.count(), { timeout: 25_000 })
    .toBeGreaterThan(0);
});

test("clicking a rail card with a report opens it in the work-order grid", async ({
  page,
}) => {
  await openTheater(page);

  // Count-agnostic, like the rest of this spec: take whichever rail card the
  // seed gave a dispatched report to. Candidate clusters have nothing to open
  // and deliberately render no link.
  const opener = page.locator('[data-testid="detection-open"]').first();
  test.skip(
    (await opener.count()) === 0,
    "no seeded detection produced a report",
  );
  const href = await opener.getAttribute("href");
  expect(href).toMatch(/\/city\/cumming\/grid\?report=[0-9a-f-]+$/);

  await opener.click();
  await page.waitForURL(/\/grid\?report=/);
  // The landing row is flagged, not merely scrolled to.
  await expect(page.locator(".wo-row-focus").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("clicking the timestamp seeks instead of navigating away", async ({
  page,
}) => {
  await openTheater(page);
  const items = railItems(page);
  const count = await items.count();
  const target = items.nth(Math.min(count - 1, Math.floor(count / 2)));
  const ts = Number.parseFloat(
    (await target.locator('[data-testid="detection-ts"]').textContent()) ?? "",
  );
  expect(Number.isFinite(ts)).toBe(true);

  await target.locator('[data-testid="detection-ts"]').click();

  await expect
    .poll(() => currentTime(page), { timeout: 15_000 })
    .toBeGreaterThan(ts - 0.75);
  // Seeking must not have followed the card's report link.
  expect(new URL(page.url()).pathname).toBe(VIDEO_PATH);
});

test("opening an evidence thumbnail shows the full frame with its box", async ({
  page,
}) => {
  await openTheater(page);

  const thumb = page
    .getByRole("button", { name: /^Open evidence frame for/ })
    .first();
  test.skip((await thumb.count()) === 0, "no cluster has a signed frame URL");
  await thumb.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-testid="evidence-box"]')).toHaveCount(1);
});
